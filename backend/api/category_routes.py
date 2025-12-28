from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta, date
from decimal import Decimal
from typing import Optional
from .db import db
from backend.db.schemas import Category as CategorySchema
import time

router = APIRouter()

# Helper function to get the next day for date range queries
def get_next_day_str(date_str: str) -> str:
    """
    Takes a date string in YYYY-MM-DD format and returns the next day
    in the same format, to be used for inclusive querying of the end date
    """
    date_obj = datetime.strptime(date_str, "%Y-%m-%d")
    next_day = date_obj + timedelta(days=1)
    return next_day.strftime("%Y-%m-%d")

# Models
class User(BaseModel):
    email: str
    user_id: str

# Request model for the POST request
class UserIDRequest(BaseModel):
    user_id: str

class CategoriesWithAllocatedRequest(BaseModel):
    user_id: str
    start_date: str
    end_date: str

class Category(BaseModel):
    name: str
    user_id: str

class DeleteCategoryRequest(BaseModel):
    category_id: str
    user_id: str

class UpdateCategoryNameRequest(BaseModel):
    category_id: str
    user_id: str
    name: str

class UpdateCategoryGoalRequest(BaseModel):
    category_id: str
    user_id: str
    goal_amount: Decimal

class UpdateCategoryGroupRequest(BaseModel):
    category_id: str
    user_id: str
    group_id: Optional[str] = None  # None means remove from group

# Category Methods
@router.post("/get-categories")
async def get_categories(request: UserIDRequest):
    try:
        # logger.info("Fetching categories for user_id: %s", request.user_id)
        
        # Query categories with a `user` field equal to `user_ref`
        # logger.info("Querying categories for user_ref: %s", request.user_id)
        categories_query = db.collection("categories").where("user_id", "==", request.user_id)
        categories_docs = categories_query.stream()

        # Collect categories into a list, converting each document to a dictionary
        categories = []
        for doc in categories_docs:
            category_data = doc.to_dict()
            category_data["id"] = doc.id  # Add the category ID to the response
            
            # Remove or handle any unserializable fields here, if necessary
            
            categories.append(category_data)

        # logger.info("Successfully fetched categories for user_id: %s", request.user_id)
        # logger.info("Categories: %s", categories)
        return {"categories": categories}
    
    except Exception as e:
        # logger.error("Failed to get categories for user_id: %s, error: %s", request.user_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to get categories: %e")

# TODO: implement eviction strategy, implement way to write through the cache whenever a transaction or assignment is added to that date range. could put start date and end date in cache value so that we can check if something occurs in those 
gas_cache = {}
# keep new dict of frequencies with dict of hashes
freqs = {}
capacity = 5
start_time = time.perf_counter()
ttl = 1200
short_lived_ttl = 60

def add_to_cache(key: str, val: object, short_lived: bool) -> None:
    # cache[key] = {val, ttl, freq = 0}
    if len(gas_cache) == capacity:
        raise OverflowError('cache is at capacity, something went wrong')
    
    # print(f'short lived: {short_lived}, time: {time.perf_counter()}, expiration: {time.perf_counter() + short_lived_ttl if short_lived else ttl}')
    gas_cache[key] = {
        'value': val,
        'expiration_time': time.perf_counter() + (short_lived_ttl if short_lived else ttl),
        'frequency': 0
    }
    if 0 not in freqs:
        freqs[0] = {}
    freqs[0][key] = None

def remove_from_cache(key: Optional[str] = None) -> None:
    try:
        if key == None:
            min_freq = min(freqs)
            key = next(iter(freqs[min_freq]))
        # print(f'key to remove: {key}')
        # freq = cache[key][freq]
        freq = gas_cache[key]['frequency']
        # del cache[key]
        # print(f'deleting from cache')
        del gas_cache[key]
        # del freqs[freq][key]
        # print(f'deleting from freqs')
        del freqs[freq][key]
        if len(freqs[freq]) == 0:
            del freqs[freq]
    except Exception as e:
        print(f'exception while removing: {e}')

def read_from_cache(key: str) -> object:
    # get frequency of key
    freq = gas_cache[key]['frequency']
    del freqs[freq][key]
    # cleanup freq if no more values exist in it
    if len(freqs[freq]) == 0:
        del freqs[freq]
    # add key to new frequency
    if freq+1 not in freqs:
        freqs[freq+1] = {}
    freqs[freq+1][key] = None
    # increment frequency
    gas_cache[key]['frequency'] += 1
    # return val
    return gas_cache[key]['value']


@router.post("/get-allocated-and-spent")
async def get_allocated_and_spent(request: CategoriesWithAllocatedRequest):
    # hash request params
    req_hash = hash(f'{request.user_id}{request.start_date}{request.end_date}')
    # print(f'req hash: {req_hash}')
    
    # if hash is in cache
    if req_hash in gas_cache:
        # if now < ttl
        now = time.perf_counter()
        if now < gas_cache[req_hash]['expiration_time']:
            # return cached value
            print(f'cache hit, returning value from cache')
            return read_from_cache(req_hash)
        # else
        else:
            # delete item from cache
            print(f'removing value from cache because of ttl. now: {now}, expiration: {gas_cache[req_hash]["expiration_time"]}')
            remove_from_cache(req_hash)
        
    try:
        # Query categories with a `user_id` field equal to `request.user_id`
        categories_query = db.collection("categories").where("user_id", "==", request.user_id)
        categories_docs = categories_query.stream()
        
        # print(f"DEBUG - Categories query: {categories_query._query.to_dict()}")
        
        # Count categories for debugging
        category_count = 0
        
        # Collect categories into a list, converting each document to a dictionary
        allocated_and_spent = []
        for doc in categories_docs:
            category_count += 1
            category_data = doc.to_dict()
            # print(f"DEBUG - Processing category: {doc.id}, name: {category_data.get('name', 'Unknown')}")
            
            category_result = {}
            category_result["category_id"] = doc.id  # Add the category ID to the response
            
            # Calculate allocated amount for the category
            # Using helper function to get the next day for inclusive end date
            next_day_str = get_next_day_str(request.end_date)
            assignments_query = db.collection("assignments").where("category_id", "==", doc.id).where("date", ">=", request.start_date).where("date", "<", next_day_str)
            # print(f"DEBUG - Using date range: {request.start_date} to {request.end_date} (exclusive upper bound: {next_day_str})")

            try:
                # print(f"DEBUG - About to stream assignments for category {doc.id}")
                assignments_docs = assignments_query.stream()
                # print(f"DEBUG - Stream operation completed for category {doc.id}")
                
                # Count assignments for debugging
                assignment_count = 0
                assignment_total = Decimal('0.0')
                
                for assignment in assignments_docs:
                    assignment_count += 1
                    assignment_data = assignment.to_dict()
                    # print(f"DEBUG - Assignment found: {assignment_data}")
                    amount = Decimal(str(assignment_data.get("amount", 0.0)))
                    assignment_total += amount
                    # print(f"DEBUG - Running total: {assignment_total}")
                
                # print(f"DEBUG - Found {assignment_count} assignments for category {doc.id}")
                allocated_amount = float(assignment_total)
                
            except Exception as stream_error:
                # print(f"DEBUG - Error streaming assignments: {str(stream_error)}")
                # Fallback to ensure we continue processing
                allocated_amount = 0.0
                
            category_result["allocated"] = allocated_amount

            # Calculate spent amount for the category (transactions in the time period)
            spent_amount = Decimal('0.0')
            try:
                # Skip spending calculation for unallocated funds category
                if not category_data.get("is_unallocated_funds", False):
                    transactions_query = db.collection("transactions").where("category_id", "==", doc.id).where("date", ">=", request.start_date).where("date", "<", next_day_str)
                    transactions_docs = transactions_query.stream()
                    
                    for transaction in transactions_docs:
                        transaction_data = transaction.to_dict()
                        amount = Decimal(str(transaction_data.get("amount", 0.0)))
                        # If amount is negative, it's spending (add to total)
                        # If amount is positive, it's a refund/return (subtract from total)
                        if amount < 0:
                            spent_amount += abs(amount)
                        else:
                            spent_amount -= amount
                    
                    # Allow negative spent amounts (when refunds exceed spending)
                    
            except Exception as spent_error:
                # print(f"DEBUG - Error calculating spent amount: {str(spent_error)}")
                spent_amount = Decimal('0.0')
            
            category_result["spent"] = float(spent_amount)
            allocated_and_spent.append(category_result)

        # print(f"DEBUG - Processed {category_count} categories, returning {len(allocated_and_spent)} allocation records")
        
        # Calculate unallocated funds (sum of transactions in unallocated funds category)
        unallocated_income = Decimal('0.0')
        try:
            # Find the unallocated funds category for this user
            unallocated_query = db.collection("categories").where("user_id", "==", request.user_id).where("is_unallocated_funds", "==", True).limit(1)
            unallocated_docs = unallocated_query.stream()
            
            unallocated_category = None
            for doc in unallocated_docs:
                unallocated_category = doc
                break
            
            if unallocated_category:
                # Get transactions for the unallocated funds category within the date range
                next_day_str = get_next_day_str(request.end_date)
                unallocated_transactions_query = db.collection("transactions").where("category_id", "==", unallocated_category.id).where("date", ">=", request.start_date).where("date", "<", next_day_str)
                unallocated_transactions_docs = unallocated_transactions_query.stream()
                
                # Sum up the transaction amounts (income should be positive)
                for transaction in unallocated_transactions_docs:
                    transaction_data = transaction.to_dict()
                    amount = Decimal(str(transaction_data.get("amount", 0.0)))
                    unallocated_income += amount
                    
        except Exception as unallocated_error:
            # Don't fail the entire request if unallocated funds calculation fails
            print(f"DEBUG - Error calculating unallocated funds: {str(unallocated_error)}")
            unallocated_income = Decimal('0.0')
        
        response = {"allocated_and_spent": allocated_and_spent, "unallocated_income": float(unallocated_income)}

        # if size of cache plus size of val <= capacity
        if len(gas_cache) == capacity:
            # remove lfu item from cache
            print(f'removing lfu from cache')
            try:
                remove_from_cache()
            except Exception as e:
                print(f'exception calling remove from cache with lfu: {e}')
        print(f'adding to cache')
        # Get today's date and end date in correct format
        today = date.today()
        end_date = datetime.strptime(request.end_date, "%Y-%m-%d").date()

        # Compare the dates
        date_in_cache_range = end_date < today
        # print(f'end: {end_date}, today: {today}, in range: {date_in_cache_range}')
        add_to_cache(req_hash, response, not date_in_cache_range)
        

        return response
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get categories with allocated and spent amounts: {str(e)}")

@router.post("/create-category")
async def create_category(category: Category):
    try:
        user_ref = db.collection("users").document(category.user_id)
        user_doc = user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail="User not found")

        # Create a validated category using our schema
        category_data = CategorySchema(
            name=category.name,
            user_id=category.user_id,
            available=0.0,
            is_unallocated_funds=False
        )
        
        # logger.info("Creating a new category with name: %s", category.name)
        category_ref = db.collection("categories").document()
        category_ref.set(category_data.to_dict())
        
        # logger.info("Category created successfully with ID: %s", category_ref.id)
        return {"message": "Category created successfully.", "category_id": category_ref.id}
    except ValueError as e:
        # This will catch validation errors from the Pydantic model
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # logger.error("Failed to create category: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to create category: {str(e)}")

@router.post("/update-category-name")
async def update_category_name(request: UpdateCategoryNameRequest):
    try:
        # Verify the category exists and belongs to the user
        category_ref = db.collection("categories").document(request.category_id)
        category_doc = category_ref.get()
        
        if not category_doc.exists:
            raise HTTPException(status_code=404, detail="Category not found")
            
        category_data = category_doc.to_dict()
        if category_data.get("user_id") != request.user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this category")
        
        # Update the category name
        category_ref.update({"name": request.name})
        
        return {"message": "Category name updated successfully"}
    
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update category name: {str(e)}")

@router.post("/update-category-goal")
async def update_category_goal(request: UpdateCategoryGoalRequest):
    try:
        # Verify the category exists and belongs to the user
        category_ref = db.collection("categories").document(request.category_id)
        category_doc = category_ref.get()
        
        if not category_doc.exists:
            raise HTTPException(status_code=404, detail="Category not found")
            
        category_data = category_doc.to_dict()
        if category_data.get("user_id") != request.user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this category")
        
        # Validate goal amount
        if request.goal_amount < 0:
            raise HTTPException(status_code=400, detail="Goal amount cannot be negative")
        
        # Update the category goal amount
        goal_amount = None if request.goal_amount == 0 else float(request.goal_amount)
        category_ref.update({"goal_amount": goal_amount})
        
        return {"message": "Category goal updated successfully"}
    
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update category goal: {str(e)}")

@router.post("/update-category-group")
async def update_category_group(request: UpdateCategoryGroupRequest):
    try:
        # Verify the category exists and belongs to the user
        category_ref = db.collection("categories").document(request.category_id)
        category_doc = category_ref.get()
        
        if not category_doc.exists:
            raise HTTPException(status_code=404, detail="Category not found")
            
        category_data = category_doc.to_dict()
        if category_data.get("user_id") != request.user_id:
            raise HTTPException(status_code=403, detail="Not authorized to update this category")
        
        # If group_id is provided, verify it exists and belongs to the user
        if request.group_id:
            group_ref = db.collection("category_groups").document(request.group_id)
            group_doc = group_ref.get()
            
            if not group_doc.exists:
                raise HTTPException(status_code=404, detail="Category group not found")
                
            group_data = group_doc.to_dict()
            if group_data.get("user_id") != request.user_id:
                raise HTTPException(status_code=403, detail="Not authorized to use this category group")
        
        # Update the category group
        category_ref.update({"group_id": request.group_id})
        
        return {"message": "Category group updated successfully"}
    
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update category group: {str(e)}")

@router.post("/delete-category")
async def delete_category(request: DeleteCategoryRequest):
    try:
        # Verify the category exists and belongs to the user
        category_ref = db.collection("categories").document(request.category_id)
        category_doc = category_ref.get()
        
        if not category_doc.exists:
            raise HTTPException(status_code=404, detail="Category not found")
            
        category_data = category_doc.to_dict()
        if category_data.get("user_id") != request.user_id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this category")
        
        # Check if any transactions use this category
        transactions_query = db.collection("transactions").where("category_id", "==", request.category_id)
        transactions = list(transactions_query.stream())
        
        if transactions:
            raise HTTPException(status_code=400, detail="Cannot delete category with associated transactions")
        
        # Check if category has non-zero available amount
        available_amount = category_data.get("available", 0.0)
        if available_amount != 0:
            raise HTTPException(status_code=400, detail="Cannot delete category with non-zero available amount. Please allocate or move the funds first.")
        
        # Delete all assignments associated with this category
        assignments_query = db.collection("assignments").where("category_id", "==", request.category_id)
        assignments = list(assignments_query.stream())
        
        # Use batch write for atomicity
        batch = db.batch()
        
        # Delete each assignment
        for assignment_doc in assignments:
            batch.delete(assignment_doc.reference)
        
        # Delete the category
        batch.delete(category_ref)
        
        # Execute all deletions atomically
        batch.commit()
        return {"message": "Category deleted successfully"}
    
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete category: {str(e)}")