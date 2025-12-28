import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, SafeAreaView, Text, StyleSheet, FlatList, Button, TouchableOpacity, Alert, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useAuth } from '@/context/AuthProvider';
import { useCategories } from '@/context/CategoriesProvider';
import AddCategoryModal from '@/components/budget/AddCategoryModal';
import AddCategoryGroupModal from '@/components/budget/AddCategoryGroupModal';
import AssignmentModal from '@/components/budget/AssignmentModal';
import CategoryInfoModal from '@/components/budget/CategoryInfoModal';
import ConfirmationModal from '@/components/budget/ConfirmationModal';
import BudgetTabHeader from '@/components/budget/BudgetTabHeader';
import { deleteCategory } from '@/services/categories';
import { createAssignment } from '@/services/assignments';
import { formatDateToYYYYMMDD } from '@/utils/dateUtils';
import { Category } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetPeriod } from '@/hooks/useBudgetPeriod';
import { useAllocatedAndSpent } from '@/hooks/useAllocatedAndSpent';
import { useCategoryHandlers } from '@/hooks/useCategoryHandlers';
import {
  setPreviousBudgetPeriodTimeFrame,
  setNextBudgetPeriodTimeFrame,
} from '@/utils/dateUtils';

export default function Tab() {
  const { user } = useAuth();
  const { categories, categoryGroups, loading, groupsLoading, unallocatedFunds } = useCategories();
  const {
    startDate,
    endDate,
    budgetPeriod,
    setStartDate,
    setEndDate,
    setBudgetPeriod,
  } = useBudgetPeriod(user);
  const {
    allocatedAndSpent,
    unallocatedIncome,
    loading: allocatedSpentLoading,
    fetchAllocatedAndSpent,
    getAllocatedAmount,
    getSpentAmount,
    setAllocatedAndSpent,
    setUnallocatedIncome,
  } = useAllocatedAndSpent(user, startDate, endDate);
  const [modalVisible, setModalVisible] = useState(false);
  const [categoryGroupModalVisible, setCategoryGroupModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [selectedInfoCategory, setSelectedInfoCategory] = useState<Category | null>(null);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [errorModalVisible, setErrorModalVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fixingCategories, setFixingCategories] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Initialize expanded groups when category groups are loaded
  useEffect(() => {
    if (!groupsLoading && categoryGroups.length > 0) {
      const allGroupIds = categoryGroups.map(group => group.id);
      allGroupIds.push('ungrouped'); // Add ungrouped section
      setExpandedGroups(new Set(allGroupIds));
    }
  }, [categoryGroups, groupsLoading]);

  // Group categories by their group_id
  const groupedCategories = useMemo(() => {
    const nonUnallocatedCategories = categories.filter((category: any) => !category.is_unallocated_funds);
    
    const groups: { [key: string]: Category[] } = {};
    const ungrouped: Category[] = [];
    
    nonUnallocatedCategories.forEach((category: Category) => {
      if (category.group_id) {
        if (!groups[category.group_id]) {
          groups[category.group_id] = [];
        }
        groups[category.group_id].push(category);
      } else {
        ungrouped.push(category);
      }
    });
    
    return { groups, ungrouped };
  }, [categories]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(groupId)) {
        newExpanded.delete(groupId);
      } else {
        newExpanded.add(groupId);
      }
      return newExpanded;
    });
  };

  const renderGroupHeader = (groupId: string, groupName: string, categories: Category[]) => {
    const isExpanded = expandedGroups.has(groupId);
    
    // Calculate total allocated and spent for the group
    const groupTotals = categories.reduce((totals, category) => {
      const allocated = getAllocatedAmount(category.id);
      const spent = getSpentAmount(category.id);
      return {
        allocated: totals.allocated + allocated,
        spent: totals.spent + spent,
      };
    }, { allocated: 0, spent: 0 });
    
    return (
      <TouchableOpacity
        style={styles.groupHeader}
        onPress={() => toggleGroup(groupId)}
        accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} ${groupName} group`}
      >
        <View style={styles.groupHeaderLeft}>
          <Ionicons 
            name={isExpanded ? 'chevron-down' : 'chevron-forward'} 
            size={20} 
            color="#007BFF" 
          />
          <Text style={styles.groupTitle}>{groupName}</Text>
          <Text style={styles.groupCount}>({categories.length})</Text>
        </View>
        <View style={styles.groupTotals}>
          <Text style={styles.groupTotalText}>
            Allocated: ${groupTotals.allocated.toFixed(2)}
          </Text>
          <Text style={styles.groupTotalText}>
            Spent: ${groupTotals.spent.toFixed(2)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCategoriesInGroup = (categories: Category[]) => {
    return categories.map((category) => (
      <View key={category.id} style={styles.groupedCategoryItem}>
        {renderItem({ item: category })}
      </View>
    ));
  };

  // Log category groups to console for demonstration
  useEffect(() => {
    if (!groupsLoading && categoryGroups.length >= 0) {
      console.log('=== Category Groups ===');
      console.log('Groups loading:', groupsLoading);
      console.log('Number of groups:', categoryGroups.length);
      console.log('Category groups:', categoryGroups);
      
      if (categoryGroups.length > 0) {
        categoryGroups.forEach((group, index) => {
          console.log(`Group ${index + 1}:`, {
            id: group.id,
            name: group.name,
            sortOrder: group.sort_order,
            createdAt: group.created_at
          });
        });
      } else {
        console.log('No category groups found');
      }
    }
  }, [categoryGroups, groupsLoading]);

  const {
    handleCategoryNameUpdate,
    handleCategoryGoalUpdate,
  } = useCategoryHandlers({
    fetchAllocatedAndSpent,
    selectedInfoCategory,
    setSelectedInfoCategory,
  });

  const handleCategoryDelete = (category: Category) => {
    console.log('Deleting category:', category, user);
    if (user) {
      setCategoryToDelete(category);
      setDeleteConfirmVisible(true);
    }
  };

  const confirmCategoryDelete = async () => {
    if (user && categoryToDelete) {
      try {
        await deleteCategory(user.uid, categoryToDelete.id);
        fetchAllocatedAndSpent();
        setDeleteConfirmVisible(false);
        setCategoryToDelete(null);
      } catch (error: any) {
        setDeleteConfirmVisible(false);
        setCategoryToDelete(null);
        setErrorMessage(error.message || "This category may have transactions or assignments associated with it.");
        setErrorModalVisible(true);
      }
    }
  };

  const cancelCategoryDelete = () => {
    setDeleteConfirmVisible(false);
    setCategoryToDelete(null);
  };

  const handleFixNegativeAvailable = async (category: Category) => {
    if (category.available >= 0) return;
    
    // Check if this category is already being fixed
    if (fixingCategories.has(category.id)) return;
    
    // Add category to fixing set
    setFixingCategories(prev => new Set(prev).add(category.id));
    
    const amountToAllocate = Math.abs(category.available);
    const assignment = {
      amount: amountToAllocate,
      user_id: user?.uid || '',
      category_id: category.id,
      date: formatDateToYYYYMMDD(new Date()),
    };

    // Store the current allocated amount for potential rollback
    const currentAllocated = allocatedAndSpent[category.id]?.allocated || 0;
    const newAllocated = currentAllocated + amountToAllocate;

    // Optimistically update the allocated amount
    setAllocatedAndSpent(prev => ({
      ...prev,
      [category.id]: {
        allocated: newAllocated,
        spent: prev[category.id]?.spent || 0
      }
    }));

    try {
      await createAssignment(assignment);
      // No need to fetch allocated and spent since we updated optimistically
    } catch (error) {
      console.error('Error fixing negative available:', error);
      // Revert optimistic updates on error - restore the exact previous state
      setAllocatedAndSpent(prev => ({
        ...prev,
        [category.id]: {
          allocated: currentAllocated,
          spent: prev[category.id]?.spent || 0
        }
      }));
    } finally {
      // Remove category from fixing set after operation completes
      setFixingCategories(prev => {
        const newSet = new Set(prev);
        newSet.delete(category.id);
        return newSet;
      });
    }
  };

  const handleAllocateToGoal = async (category: Category) => {
    if (!category.goal_amount) return;
    
    const allocatedAmount = getAllocatedAmount(category.id);
    const shortfall = category.goal_amount - allocatedAmount;
    
    if (shortfall <= 0) return;
    
    const assignment = {
      amount: shortfall,
      user_id: user?.uid || '',
      category_id: category.id,
      date: formatDateToYYYYMMDD(new Date()),
    };

    // Store the current allocated amount for potential rollback
    const currentAllocated = allocatedAndSpent[category.id]?.allocated || 0;
    const newAllocated = currentAllocated + shortfall;

    // Optimistically update the allocated amount
    setAllocatedAndSpent(prev => ({
      ...prev,
      [category.id]: {
        allocated: newAllocated,
        spent: prev[category.id]?.spent || 0
      }
    }));

    try {
      await createAssignment(assignment);
      // No need to fetch allocated and spent since we updated optimistically
    } catch (error) {
      console.error('Error allocating to goal:', error);
      // Revert optimistic updates on error - restore the exact previous state
      setAllocatedAndSpent(prev => ({
        ...prev,
        [category.id]: {
          allocated: currentAllocated,
          spent: prev[category.id]?.spent || 0
        }
      }));
    }
  };

  const renderItem = ({ item }: { item: Category }) => {
    const allocatedAmount = getAllocatedAmount(item.id);
    const spentAmount = getSpentAmount(item.id);
    const hasNegativeAvailable = item.available < 0;
    const hasGoalShortfall = item.goal_amount && allocatedAmount < item.goal_amount;
    const isBeingFixed = fixingCategories.has(item.id);
    
    return (
      <View style={styles.item}>
        
        <TouchableOpacity
          style={styles.categoryContent}
          onPress={() => setSelectedCategory(item)}
        >
          <View style={styles.nameContainer}>
            <Text style={styles.name}>{item.name}</Text>
            <TouchableOpacity 
              style={styles.infoButton}
              onPress={() => {
                setSelectedInfoCategory(item);
                setInfoModalVisible(true);
              }}
              accessibilityLabel={`Show info for ${item.name}`}
            >
              <Ionicons 
                name="information-circle-outline" 
                size={22} 
                color="#007BFF" 
                accessibilityLabel="Info"
              />
            </TouchableOpacity>
          </View>
          
          <View style={styles.valuesContainer}>
            <View style={styles.mainValuesRow}>
              {/* Quick action buttons */}
              {!allocatedSpentLoading && (
                <View style={styles.actionButtons}>
                  {hasNegativeAvailable && !isBeingFixed && (
                    <TouchableOpacity
                      style={styles.fixButton}
                      onPress={() => handleFixNegativeAvailable(item)}
                      accessibilityLabel={`Fix negative available for ${item.name}`}
                    >
                      <Ionicons name="add-circle" size={20} color="#FF6B6B" />
                      <Text style={styles.fixButtonText}>Fix</Text>
                    </TouchableOpacity>
                  )}
                  
                  {isBeingFixed && (
                    <View style={styles.fixingButton}>
                      <Ionicons name="checkmark-circle" size={20} color="#28A745" />
                      <Text style={styles.fixingButtonText}>Fixing...</Text>
                    </View>
                  )}
                  
                  {hasGoalShortfall && (
                    <TouchableOpacity
                      style={styles.goalButton}
                      onPress={() => handleAllocateToGoal(item)}
                      accessibilityLabel={`Allocate to goal for ${item.name}`}
                    >
                      <Ionicons name="flag" size={20} color="#4ECDC4" />
                      <Text style={styles.goalButtonText}>Goal</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={styles.horizontalValuesContainer}>
                {allocatedSpentLoading ? (
                  <View style={styles.loadingPeriodContainer}>
                    <ActivityIndicator size="small" color="#007BFF" />
                    <Text style={styles.loadingText}>Loading...</Text>
                  </View>
                ) : (
                  <View style={styles.periodValuesContainer}>
                    <Text style={[styles.periodLabel]}>This Period:</Text>
                    <Text style={[styles.periodValue, allocatedAmount < 0 && styles.negativeValue]}>Allocated: {allocatedAmount >= 0 ? '$' : '-$'}{Math.abs(allocatedAmount).toFixed(2)}</Text>
                    <Text style={[styles.periodValue]}>Spent: {spentAmount >= 0 ? '$' : '-$'}{Math.abs(spentAmount).toFixed(2)}</Text>
                  </View>
                )}
                <View style={[styles.totalValueContainer, { borderLeftColor: item.available >= 0 ? '#28A745' : '#DC3545' }]}>
                  <Text style={[
                    styles.totalValue, 
                    item.available > 0 ? styles.positiveValue : (item.available < 0 ? styles.negativeValue : null)
                  ]}>
                    Available: {item.available >= 0 ? '$' : '-$'}{Math.abs(item.available).toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.deleteButton, Platform.OS === 'web' && styles.webDeleteButton]}
          onPress={() => handleCategoryDelete(item)}
          role="button"
          aria-label={`Delete ${item.name} category`}
        >
          <Ionicons 
            name="trash-outline" 
            size={24} 
            color="red" 
            accessibilityLabel="Delete"
          />
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return <Text>Loading...</Text>;
  }
  return (
    <SafeAreaView style={styles.container}>
      <BudgetTabHeader
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
        userPreferences={user?.preferences}
        setBudgetPeriod={setBudgetPeriod}
        budgetPeriod={budgetPeriod}
        setPreviousBudgetPeriodTimeFrame={setPreviousBudgetPeriodTimeFrame}
        setNextBudgetPeriodTimeFrame={setNextBudgetPeriodTimeFrame}
        unallocatedFunds={unallocatedFunds}
        unallocatedIncome={unallocatedIncome}
        onAddCategoryPress={() => setModalVisible(true)}
        onAddCategoryGroupPress={() => setCategoryGroupModalVisible(true)}
        incomeLoading={allocatedSpentLoading}
      />
      {categories.length > 0 && (
        <ScrollView contentContainerStyle={styles.listContent}>
          {/* Render groups with categories */}
          {Object.entries(groupedCategories.groups).map(([groupId, categories]) => {
            const group = categoryGroups.find(g => g.id === groupId);
            const groupName = group?.name || 'Unknown Group';
            const isExpanded = expandedGroups.has(groupId);
            
            return (
              <View key={groupId} style={styles.groupSection}>
                {renderGroupHeader(groupId, groupName, categories)}
                {isExpanded && (
                  <View style={styles.groupContent}>
                    {renderCategoriesInGroup(categories)}
                  </View>
                )}
              </View>
            );
          })}
          
          {/* Render ungrouped categories */}
          {groupedCategories.ungrouped.length > 0 && (
            <View style={styles.groupSection}>
              {renderGroupHeader('ungrouped', 'Ungrouped', groupedCategories.ungrouped)}
              {expandedGroups.has('ungrouped') && (
                <View style={styles.groupContent}>
                  {renderCategoriesInGroup(groupedCategories.ungrouped)}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
      <AddCategoryModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        userId={user?.uid}
        onNewCategory={() => {
          fetchAllocatedAndSpent();
        }}
      />
      <AddCategoryGroupModal
        visible={categoryGroupModalVisible}
        onClose={() => setCategoryGroupModalVisible(false)}
        userId={user?.uid}
        onNewCategoryGroup={() => {
          // Category groups are automatically updated via Firestore listener
          // No manual refresh needed
        }}
      />
      <AssignmentModal
        visible={!!selectedCategory}
        onClose={() => setSelectedCategory(null)}
        category={selectedCategory}
        userId={user?.uid || ''}
        onAssignmentCreated={() => {
          fetchAllocatedAndSpent();
        }}
      />      
      <CategoryInfoModal 
        visible={infoModalVisible}
        category={selectedInfoCategory}
        onClose={() => setInfoModalVisible(false)}
        startDate={startDate}
        endDate={endDate}
        onCategoryNameUpdate={handleCategoryNameUpdate}
        onCategoryGoalUpdate={handleCategoryGoalUpdate}
        onCategoryGroupUpdate={(categoryId, groupId) => {
          // The category will be automatically updated via Firestore listener
          console.log(`Category ${categoryId} moved to group ${groupId || 'No Group'}`);
        }}
      />
      <ConfirmationModal
        visible={deleteConfirmVisible}
        title="Delete Category"
        message={`Are you sure you want to delete "${categoryToDelete?.name}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmStyle="destructive"
        onConfirm={confirmCategoryDelete}
        onCancel={cancelCategoryDelete}
      />
      <ConfirmationModal
        visible={errorModalVisible}
        title="Cannot Delete Category"
        message={errorMessage}
        confirmText="OK"
        cancelText=""
        onConfirm={() => setErrorModalVisible(false)}
        onCancel={() => setErrorModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  categoryContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },  
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoButton: {
    marginLeft: 8,
    padding: 4,
  },
  valuesContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  mainValuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  horizontalValuesContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  periodValuesContainer: {
    backgroundColor: '#F8F9FA',
    padding: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007BFF',
    flex: 1,
    minWidth: 140,
  },
  periodLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007BFF',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  periodValue: {
    fontSize: 14,
    color: '#495057',
    marginVertical: 1,
  },
  totalValueContainer: {
    backgroundColor: '#F8F9FA',
    padding: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  value: {
    fontSize: 16,
    color: '#666',
    marginHorizontal: 8,
  },
  negativeValue: {
    color: 'red',
  },
  positiveValue: {
    color: '#28A745',
  },
  actionButtons: {
    flexDirection: 'column',
    gap: 6,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  fixButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE5E5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  fixButtonText: {
    color: '#FF6B6B',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  fixingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#28A745',
  },
  fixingButtonText: {
    color: '#28A745',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  goalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5F9F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4ECDC4',
  },
  goalButtonText: {
    color: '#4ECDC4',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  deleteButton: {
    padding: 8,
    marginLeft: 10,
  },
  webDeleteButton: {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flexDirection: 'column',
    gap: 6,
    alignItems: 'flex-start',
    justifyContent: 'center',
    minHeight: 44, // Match the height of action buttons
  },
  loadingPeriodContainer: {
    backgroundColor: '#F8F9FA',
    padding: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007BFF',
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: '500',
  },
  // Group accordion styles
  groupSection: {
    marginBottom: 12,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007BFF',
    marginBottom: 4,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  groupCount: {
    fontSize: 14,
    color: '#666',
    marginLeft: 6,
  },
  groupTotals: {
    alignItems: 'flex-end',
  },
  groupTotalText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  groupContent: {
    backgroundColor: '#FAFBFC',
    borderRadius: 8,
    overflow: 'hidden',
  },
  groupedCategoryItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
});
