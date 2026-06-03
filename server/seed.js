require('dotenv').config({ path: '../.env' });

const mongoose = require('mongoose');
const { User, Transaction, connectDB } = require('./db');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not defined in .env");
  process.exit(1);
}

const seedData = async () => {
  await connectDB();

  try {
    console.log("🧹 Clearing old data...");
    await User.deleteMany();
    await Transaction.deleteMany();

    console.log("👤 Creating demo user...");
    const user = await User.create({
      name: 'Demo User',
      email: 'demo@example.com',
      password: 'password123'
    });

    const categories = ['Food & Drink', 'Transportation', 'Shopping', 'Entertainment', 'Housing'];
    const now = new Date();
    const transactions = [];

    console.log("📊 Generating transactions...");

    for (let i = 0; i < 30; i++) {
      const daysAgo = Math.floor(Math.random() * 60);
      const date = new Date(now.getTime() - daysAgo * 86400000);

      const isIncome = Math.random() > 0.8;
      const amount = isIncome
        ? 5000 + Math.random() * 5000
        : 50 + Math.random() * 500;

      let category, description;

      if (isIncome) {
        category = 'Income';
        description = 'Salary/Freelance';
      } else {
        category = categories[Math.floor(Math.random() * categories.length)];

        const descriptions = {
          'Food & Drink': ['Starbucks', 'Grocery Store'],
          'Transportation': ['Uber', 'Gas Station'],
          'Shopping': ['Amazon'],
          'Entertainment': ['Netflix Subscription'],
          'Housing': ['Rent/Utilities']
        };

        const options = descriptions[category];
        description = options[Math.floor(Math.random() * options.length)];
      }

      transactions.push({
        user: user._id,
        amount: Number(amount.toFixed(2)),
        type: isIncome ? 'income' : 'expense',
        category,
        description,
        date
      });
    }

    await Transaction.insertMany(transactions);

    console.log('🎉 Data Seeded Successfully');
    process.exit(0);

  } catch (err) {
    console.error('❌ Seeding Error:', err.message);
    process.exit(1);
  }
};

seedData();