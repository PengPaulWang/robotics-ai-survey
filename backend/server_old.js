const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors()); // Allow cross-origin requests from your frontend

// MongoDB Connection String for local macOS setup
const uri = 'mongodb://localhost:27017/cardRatingsDB'; // Database name is cardRatingsDB

mongoose.connect(uri)
.then(() => console.log('Connected to MongoDB at cardRatingsDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Define Schema for userChoices collection
const choiceSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // Unique identifier for the user
    cardName: { type: String, required: true },
    ratingType: { type: String, required: true, enum: ['Significance', 'Complexity', 'Readiness'] },
    ratingValue: { type: Number, required: true, min: 0, max: 3 },
    updatedAt: { type: Date, default: Date.now }
});

const Choice = mongoose.model('Choice', choiceSchema, 'userChoices'); // Specify userChoices collection

// Endpoint to update a choice
app.put('/api/choices', async (req, res) => {
    const { userId, cardName, ratingType, ratingValue } = req.body;

    try {
        let choice = await Choice.findOneAndUpdate(
            { userId, cardName, ratingType },
            { ratingValue, updatedAt: new Date() },
            { new: true, upsert: true } // Create if it doesn't exist
        );
        res.json({ success: true, choice });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating choice', error });
    }
});

// Start server
app.listen(5000, () => console.log('Server running on port 5000'));