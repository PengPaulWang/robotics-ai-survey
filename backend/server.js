const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// Load environment variables
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5001;

// Debug environment variables
console.log('=== ENVIRONMENT DEBUG ===');
console.log('PORT:', port);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);
console.log('========================');

// Update CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://192.168.50.6:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
    console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.path}`);
    if (req.method !== 'GET') {
        console.log('📄 Request body:', req.body);
    }
    next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// MongoDB connection
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'cardRatingsDB';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

console.log('🔌 Connecting to MongoDB...');
console.log('URI:', uri);
console.log('Database Name:', dbName);

let db, usersCollection, ratingsCollection;

MongoClient.connect(uri, { useUnifiedTopology: true })
  .then(client => {
    console.log(`✅ Connected to MongoDB at ${dbName}`);
    db = client.db(dbName);
    usersCollection = db.collection('users');
    ratingsCollection = db.collection('ratings');
    
    // Create indexes
    usersCollection.createIndex({ email: 1 }, { unique: true });
    ratingsCollection.createIndex({ userId: 1, cardName: 1, ratingType: 1 }, { unique: true });
    
    console.log('📊 Database collections initialized');
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('🔐 Auth check - Token present:', !!token);

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('❌ Token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid token' });
    }
    console.log('✅ Token verified for user:', user.email);
    req.user = user;
    next();
  });
};

// User Registration
app.post('/auth/register', async (req, res) => {
  try {
    console.log('👤 Registration attempt for:', req.body.email);
    
    const {
      email,
      password,
      firstName,
      lastName,
      demographics
    } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName || !demographics) {
      console.log('❌ Missing required fields in registration');
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate demographics
    const requiredDemographics = ['ageGroup', 'profession', 'gender', 'background', 'educationLevel'];
    const missingFields = requiredDemographics.filter(field => !demographics[field]);
    if (missingFields.length > 0) {
      console.log('❌ Missing demographic fields:', missingFields);
      return res.status(400).json({ error: `Missing demographic fields: ${missingFields.join(', ')}` });
    }

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      console.log('❌ User already exists:', email);
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      demographics: {
        ageGroup: demographics.ageGroup,
        profession: demographics.profession,
        gender: demographics.gender,
        background: demographics.background,
        educationLevel: demographics.educationLevel,
        country: demographics.country || null,
        experience: demographics.experience || null
      },
      createdAt: new Date(),
      lastLogin: null
    };

    const result = await usersCollection.insertOne(user);
    console.log('✅ User registered successfully:', email);
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: result.insertedId, email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: result.insertedId,
        email,
        firstName,
        lastName,
        demographics: user.demographics
      }
    });
  } catch (err) {
    console.error('❌ Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User Login
app.post('/auth/login', async (req, res) => {
  try {
    console.log('🔑 Login attempt for:', req.body.email);
    
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await usersCollection.findOne({ email });
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );

    console.log('✅ Login successful for:', email);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        demographics: user.demographics
      }
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Update rating (protected route)
app.put('/feedback', authenticateToken, async (req, res) => {
  try {
    console.log('🎯 FEEDBACK REQUEST RECEIVED');
    console.log('Request body:', req.body);
    console.log('User ID:', req.user.userId);
    
    const { cardName, ratingType, ratingValue } = req.body;
    const userId = req.user.userId;

    if (!cardName || !ratingType || ratingValue === undefined) {
      console.log('❌ Missing required fields - cardName:', !!cardName, 'ratingType:', !!ratingType, 'ratingValue:', ratingValue);
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`💾 Saving rating: ${ratingType} = ${ratingValue} for "${cardName}" by user ${userId}`);

    const result = await ratingsCollection.updateOne(
      { userId: new ObjectId(userId), cardName, ratingType },
      {
        $set: {
          userId: new ObjectId(userId),
          cardName,
          ratingType,
          ratingValue,
          timestamp: new Date()
        }
      },
      { upsert: true }
    );

    console.log('💾 Database result:', { modified: result.modifiedCount, upserted: result.upsertedCount });
    console.log(`✅ RATING SAVED SUCCESSFULLY: ${ratingType} = ${ratingValue} for "${cardName}"`);

    res.json({
      success: true,
      modified: result.modifiedCount,
      upserted: result.upsertedCount
    });
  } catch (err) {
    console.error('❌ Rating update error:', err);
    res.status(500).json({ error: 'Rating update failed' });
  }
});

// Get user ratings (protected route)
app.get('/feedback', authenticateToken, async (req, res) => {
  try {
    console.log('📖 Fetching ratings for user:', req.user.userId);
    const userId = req.user.userId;
    const ratings = await ratingsCollection.find({ userId: new ObjectId(userId) }).toArray();
    console.log(`📖 Found ${ratings.length} ratings for user`);
    res.json({ success: true, ratings });
  } catch (err) {
    console.error('❌ Fetch ratings error:', err);
    res.status(500).json({ error: 'Failed to fetch ratings' });
  }
});

// Get user profile (protected route)
app.get('/user/profile', authenticateToken, async (req, res) => {
  try {
    console.log('👤 Fetching profile for user:', req.user.userId);
    const userId = req.user.userId;
    const user = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } }
    );
    
    if (!user) {
      console.log('❌ User not found:', userId);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ Profile fetched for:', user.email);
    res.json({ success: true, user });
  } catch (err) {
    console.error('❌ Profile fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Admin route to get survey statistics (protected)
app.get('/admin/stats', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Fetching admin stats...');
    
    const userCount = await usersCollection.countDocuments();
    const ratingCount = await ratingsCollection.countDocuments();
    
    console.log(`📊 Stats: ${userCount} users, ${ratingCount} ratings`);
    
    // Demographics breakdown
    const demographicsStats = await usersCollection.aggregate([
      {
        $group: {
          _id: {
            ageGroup: '$demographics.ageGroup',
            profession: '$demographics.profession',
            gender: '$demographics.gender',
            background: '$demographics.background',
            educationLevel: '$demographics.educationLevel'
          },
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    res.json({
      success: true,
      stats: {
        totalUsers: userCount,
        totalRatings: ratingCount,
        demographics: demographicsStats
      }
    });
  } catch (err) {
    console.error('❌ Stats fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`🌐 CORS origins: ${process.env.FRONTEND_URL || 'Default origins'}`);
});

module.exports = app;