const checkRules = (transaction) => {
  let flags = [];
  
  // Rule 1: Flag large expenses
  if (transaction.type === 'expense' && transaction.amount > 1000) {
    flags.push('High value transaction');
  }

  // Rule 2: Basic keyword based categorization (fallback before LLM)
  let suggestedCategory = transaction.category;
  if (!suggestedCategory || suggestedCategory === 'Uncategorized') {
    const desc = transaction.description.toLowerCase();
    if (desc.includes('coffee') || desc.includes('starbucks')) suggestedCategory = 'Food & Drink';
    else if (desc.includes('uber') || desc.includes('lyft')) suggestedCategory = 'Transportation';
    else if (desc.includes('walmart') || desc.includes('target')) suggestedCategory = 'Shopping';
    else if (desc.includes('netflix') || desc.includes('spotify')) suggestedCategory = 'Entertainment';
    else if (desc.includes('salary') || desc.includes('payroll')) suggestedCategory = 'Income';
  }

  return {
    suggestedCategory,
    flags
  };
};

module.exports = {
  checkRules
};
