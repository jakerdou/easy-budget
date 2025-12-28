import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import DatePickers from '@/components/budget/DatePickers';
import { Category } from '@/types';

interface BudgetTabHeaderProps {
  startDate: string;
  endDate: string;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  userPreferences: any;
  setBudgetPeriod: (period: string) => void;
  budgetPeriod: string;
  setPreviousBudgetPeriodTimeFrame: (budgetPeriod: string, currentStartDate: string, currentEndDate: string, setStartDate: (date: string) => void, setEndDate: (date: string) => void) => void;
  setNextBudgetPeriodTimeFrame: (budgetPeriod: string, currentStartDate: string, currentEndDate: string, setStartDate: (date: string) => void, setEndDate: (date: string) => void) => void;
  unallocatedFunds: Category | null;
  unallocatedIncome: number;
  onAddCategoryPress: () => void;
  onAddCategoryGroupPress: () => void;
  incomeLoading?: boolean;
}

const BudgetTabHeader: React.FC<BudgetTabHeaderProps> = ({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  userPreferences,
  setBudgetPeriod,
  budgetPeriod,
  setPreviousBudgetPeriodTimeFrame,
  setNextBudgetPeriodTimeFrame,
  unallocatedFunds,
  unallocatedIncome,
  onAddCategoryPress,
  onAddCategoryGroupPress,
  incomeLoading = false,
}) => {
  return (
    <View style={styles.header}>
      <View style={styles.datePickersContainer}>
        <DatePickers
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          preferences={userPreferences}
          setBudgetPeriod={setBudgetPeriod}
          budgetPeriod={budgetPeriod}
          setPreviousBudgetPeriodTimeFrame={setPreviousBudgetPeriodTimeFrame}
          setNextBudgetPeriodTimeFrame={setNextBudgetPeriodTimeFrame}
        />
      </View>
      <View style={styles.rightContainer}>
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.addButton} 
            onPress={onAddCategoryPress}
          >
            <Text style={styles.addButtonText}>Add Category</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.addButton, styles.addGroupButton]} 
            onPress={onAddCategoryGroupPress}
          >
            <Text style={styles.addButtonText}>Add Category Group</Text>
          </TouchableOpacity>
        </View>
        {unallocatedFunds && (
          <View style={styles.unallocatedContainer}>
            <Text style={styles.headerText}>{unallocatedFunds.name}</Text>
            <Text style={[styles.headerValue, unallocatedFunds.available < 0 && styles.negativeValue]}>
              {unallocatedFunds.available >= 0 ? '$' : '-$'}{Math.abs(unallocatedFunds.available).toFixed(2)}
            </Text>
            <Text style={styles.incomeLabel}>Income This Period:</Text>
            {incomeLoading ? (
              <View style={styles.incomeLoadingContainer}>
                <ActivityIndicator size="small" color="#007BFF" />
                <Text style={styles.incomeLoadingText}>Loading...</Text>
              </View>
            ) : (
              // TODO: Should change unallocatedIncome to incomeThisPeriod
              <Text style={[styles.incomeValue, unallocatedIncome >= 0 ? styles.positiveValue : styles.negativeValue]}>
                {unallocatedIncome >= 0 ? '$' : '-$'}{Math.abs(unallocatedIncome).toFixed(2)}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#f8f8f8',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  datePickersContainer: {
    flexDirection: 'row',
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  unallocatedContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#666',
  },
  negativeValue: {
    color: 'red',
  },
  incomeLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  incomeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  positiveValue: {
    // color: '#28a745',
  },
  addButton: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  addGroupButton: {
    backgroundColor: '#28A745',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  incomeLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  incomeLoadingText: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: '500',
  },
});

export default BudgetTabHeader;
