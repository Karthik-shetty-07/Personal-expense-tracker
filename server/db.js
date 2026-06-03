const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// 📂 Local database file path
const DB_FILE = path.join(__dirname, 'database.json');
let isFallbackActive = false;

// 📖 Helper: Read JSON database
const readLocalDB = () => {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], transactions: [] }, null, 2));
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (err) {
    return { users: [], transactions: [] };
  }
};

// ✍️ Helper: Write JSON database
const writeLocalDB = (data) => {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// 🔌 Step 1: Connect to the database with automatic fallback!
const connectDB = async () => {
  const MONGO_URI = process.env.MONGO_URI;
  const isPlaceholder = !MONGO_URI || MONGO_URI.includes('your_') || MONGO_URI.includes('localhost:27017/expense-tracker');

  if (isPlaceholder) {
    console.log('⚠️ Using placeholder MONGO_URI or default. Falling back to local baby-proof JSON database (database.json)');
    isFallbackActive = true;
    return;
  }

  try {
    // Set connection timeout to 3 seconds so fallback is quick
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 3000
    });
    console.log('✅ MongoDB is connected and ready to rock!');
  } catch (err) {
    console.warn('⚠️ MongoDB connection failed:', err.message);
    console.log('💡 Switching to local baby-proof JSON database (database.json) for zero-setup convenience.');
    isFallbackActive = true;
  }
};

// 👤 Step 2: Define Mongoose Schemas (Unchanged for standard database mode!)
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Every user needs a name!']
  },
  email: {
    type: String,
    required: [true, 'Every user needs an email!'],
    unique: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a real email address!'
    ]
  },
  password: {
    type: String,
    required: [true, 'Every user needs a password!'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  preferences: {
    currency: { type: String, default: 'USD' },
    language: { type: String, default: 'en' }
  }
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: [true, 'How much money was it? Please add an amount!']
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: true
  },
  category: {
    type: String,
    required: [true, 'Which category does this belong to?'],
    default: 'Uncategorized'
  },
  description: {
    type: String,
    required: [true, 'Add a description so you remember what this was!'],
    maxlength: [200, 'Keep the description under 200 letters!']
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  aiCategorized: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

transactionSchema.index({ user: 1, date: -1 });

// Register Mongoose models
const MongooseUser = mongoose.model('User', userSchema);
const MongooseTransaction = mongoose.model('Transaction', transactionSchema);

// ============================================================
// 🛠️ MOCK DATABASE DRIVER FOR ZERO-SETUP FALLBACK
// ============================================================

class MockQuery {
  constructor(data) {
    this.data = data;
  }
  sort(options) {
    if (options && options.date) {
      this.data.sort((a, b) => {
        const d1 = new Date(a.date || 0);
        const d2 = new Date(b.date || 0);
        return options.date === -1 ? d2 - d1 : d1 - d2;
      });
    }
    return this;
  }
  limit(num) {
    this.data = this.data.slice(0, num);
    return this;
  }
  lean() {
    return this;
  }
  then(onResolve, onReject) {
    return Promise.resolve(this.data).then(onResolve, onReject);
  }
}

class MockUserQuery {
  constructor(promise) {
    this.promise = promise;
  }
  select(fields) {
    return this;
  }
  then(onResolve, onReject) {
    return this.promise.then(onResolve, onReject);
  }
}

const MockUser = {
  findOne: (query) => {
    const promise = (async () => {
      const db = readLocalDB();
      const email = query.email;
      const user = db.users.find(u => u.email === email);
      if (!user) return null;
      return {
        ...user,
        matchPassword: async (enteredPassword) => {
          try {
            return await bcrypt.compare(enteredPassword, user.password) || enteredPassword === user.password;
          } catch {
            return enteredPassword === user.password;
          }
        }
      };
    })();
    return new MockUserQuery(promise);
  },
  findById: (id) => {
    const promise = (async () => {
      const db = readLocalDB();
      const user = db.users.find(u => String(u._id) === String(id));
      if (!user) return null;
      return {
        ...user,
        matchPassword: async (enteredPassword) => {
          try {
            return await bcrypt.compare(enteredPassword, user.password) || enteredPassword === user.password;
          } catch {
            return enteredPassword === user.password;
          }
        }
      };
    })();
    return new MockUserQuery(promise);
  },
  create: async (userData) => {
    const db = readLocalDB();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userData.password, salt);

    const newUser = {
      _id: new mongoose.Types.ObjectId().toString(),
      name: userData.name,
      email: userData.email,
      password: hashedPassword,
      role: userData.role || 'user',
      preferences: {
        currency: 'USD',
        language: 'en',
        ...userData.preferences
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    newUser.id = newUser._id;
    db.users.push(newUser);
    writeLocalDB(db);
    return newUser;
  },
  deleteMany: async () => {
    const db = readLocalDB();
    db.users = [];
    writeLocalDB(db);
    return { deletedCount: 0 };
  }
};

const MockTransaction = {
  find: (query) => {
    const db = readLocalDB();
    let results = db.transactions;
    if (query && query.user) {
      results = results.filter(t => String(t.user) === String(query.user));
    }
    if (query && query.category && query.category.$regex) {
      const regex = new RegExp(query.category.$regex, 'i');
      results = results.filter(t => regex.test(t.category));
    }
    if (query && query.type) {
      results = results.filter(t => t.type === query.type);
    }
    if (query && query.date && query.date.$gte) {
      const gteDate = new Date(query.date.$gte);
      results = results.filter(t => new Date(t.date) >= gteDate);
    }
    return new MockQuery(results);
  },
  findById: async (id) => {
    const db = readLocalDB();
    const tx = db.transactions.find(t => String(t._id) === String(id));
    if (!tx) return null;
    return {
      ...tx,
      deleteOne: async function() {
        const localDb = readLocalDB();
        localDb.transactions = localDb.transactions.filter(t => String(t._id) !== String(id));
        writeLocalDB(localDb);
        return { deletedCount: 1 };
      }
    };
  },
  create: async (txData) => {
    const db = readLocalDB();
    const newTx = {
      _id: new mongoose.Types.ObjectId().toString(),
      user: txData.user,
      amount: txData.amount,
      type: txData.type,
      category: txData.category || 'Uncategorized',
      description: txData.description,
      date: txData.date || new Date().toISOString(),
      aiCategorized: txData.aiCategorized || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    newTx.id = newTx._id;
    db.transactions.push(newTx);
    writeLocalDB(db);
    return newTx;
  },
  deleteMany: async () => {
    const db = readLocalDB();
    db.transactions = [];
    writeLocalDB(db);
    return { deletedCount: 0 };
  },
  insertMany: async (transactions) => {
    const db = readLocalDB();
    const prepared = transactions.map(t => ({
      _id: t._id || new mongoose.Types.ObjectId().toString(),
      user: t.user,
      amount: t.amount,
      type: t.type,
      category: t.category,
      description: t.description,
      date: t.date || new Date().toISOString(),
      aiCategorized: t.aiCategorized || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));
    prepared.forEach(t => t.id = t._id);
    db.transactions.push(...prepared);
    writeLocalDB(db);
    return prepared;
  }
};

// ============================================================
// 🤝 DYNAMIC WRAPPER MODELS (PROXY PATTERN)
// ============================================================

const UserWrapper = {
  findOne: (query) => {
    if (isFallbackActive) return MockUser.findOne(query);
    return MongooseUser.findOne(query);
  },
  findById: (id) => {
    if (isFallbackActive) return MockUser.findById(id);
    return MongooseUser.findById(id);
  },
  create: (userData) => {
    if (isFallbackActive) return MockUser.create(userData);
    return MongooseUser.create(userData);
  },
  deleteMany: () => {
    if (isFallbackActive) return MockUser.deleteMany();
    return MongooseUser.deleteMany();
  }
};

const TransactionWrapper = {
  find: (query) => {
    if (isFallbackActive) return MockTransaction.find(query);
    return MongooseTransaction.find(query);
  },
  findById: (id) => {
    if (isFallbackActive) return MockTransaction.findById(id);
    return MongooseTransaction.findById(id);
  },
  create: (txData) => {
    if (isFallbackActive) return MockTransaction.create(txData);
    return MongooseTransaction.create(txData);
  },
  deleteMany: () => {
    if (isFallbackActive) return MockTransaction.deleteMany();
    return MongooseTransaction.deleteMany();
  },
  insertMany: (transactions) => {
    if (isFallbackActive) return MockTransaction.insertMany(transactions);
    return MongooseTransaction.insertMany(transactions);
  }
};

module.exports = {
  connectDB,
  User: UserWrapper,
  Transaction: TransactionWrapper,
  isFallbackActive: () => isFallbackActive
};
