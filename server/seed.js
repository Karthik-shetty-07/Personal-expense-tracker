const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { User, Transaction, connectDB } = require('./db');

const seedData = async () => {
  await connectDB();

  try {
    console.log('🧹 Clearing old data...');
    await User.deleteMany();
    await Transaction.deleteMany();

    const users = [
      { name: 'Ava Chen', email: 'ava@example.com', password: 'Password123!' },
      { name: 'Marcus Lee', email: 'marcus@example.com', password: 'Password123!' },
      { name: 'Test User', email: 'testuser@example.com', password: 'Secret123' }
    ];

    const createdUsers = [];
    for (const userData of users) {
      const user = await User.create(userData);
      createdUsers.push(user);
    }

    const transactionTemplates = [
      { category: 'Housing', description: 'Rent payment', amount: 1800, type: 'expense' },
      { category: 'Food & Drink', description: 'Weekly groceries', amount: 124.5, type: 'expense' },
      { category: 'Transportation', description: 'Metro pass', amount: 42, type: 'expense' },
      { category: 'Entertainment', description: 'Streaming subscription', amount: 16.99, type: 'expense' },
      { category: 'Salary', description: 'Monthly salary', amount: 5400, type: 'income' },
      { category: 'Freelance', description: 'Design contract', amount: 950, type: 'income' },
      { category: 'Shopping', description: 'New laptop bag', amount: 89.95, type: 'expense' },
      { category: 'Health', description: 'Pharmacy purchase', amount: 27.4, type: 'expense' },
      { category: 'Utilities', description: 'Electric bill', amount: 93.2, type: 'expense' },
      { category: 'Investment', description: 'Dividend payout', amount: 185, type: 'income' }
    ];

    const transactions = [];
    const now = new Date();

    createdUsers.forEach((user, userIndex) => {
      for (let i = 0; i < 24; i += 1) {
        const template = transactionTemplates[(userIndex + i) % transactionTemplates.length];
        const daysAgo = i * 3 + (userIndex % 5) * 2;
        const date = new Date(now.getTime() - daysAgo * 86400000);
        const amount = Number((template.amount + (i % 3) * 18 + userIndex * 5).toFixed(2));
        const description = `${template.description} ${i + 1}`;

        transactions.push({
          user: user._id,
          amount,
          type: template.type,
          category: template.category,
          description,
          date
        });
      }
    });

    await Transaction.insertMany(transactions);

    console.log(`🎉 Seeded ${createdUsers.length} users and ${transactions.length} realistic transactions.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding Error:', err.message);
    process.exit(1);
  }
};

seedData();