const express = require('express'); // Express framework
const cors = require('cors'); // Enable CORS
const sqlite3 = require('sqlite3').verbose(); // SQLite database
const path = require('path'); // File path utilities
require('dotenv').config(); // Load environment variables

const app = express();
const PORT = process.env.PORT || 5000; // Server port

// Middleware
app.use(cors()); // Allow cross-origin requests
app.use(express.json()); // Parse JSON request bodies

// Initialize SQLite database
const dbPath = path.join(__dirname, 'feedback.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to feedback database:', err.message);
  } else {
    console.log('Connected to feedback database SQLite file.');
  }
});

// Create feedback table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      wallet_address TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Feedback table verified/created.');
    }
  });
});

// API to submit feedback
app.post('/api/feedback', (req, res) => {
  const { rating, comment, walletAddress } = req.body;

  // Validate rating
  if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Invalid rating. Must be a number between 1 and 5.' });
  }

  // Validate comment
  if (!comment || typeof comment !== 'string' || comment.trim() === '') {
    return res.status(400).json({ error: 'Comment is required and cannot be empty.' });
  }

  // SQL query to insert feedback
  const query = `
    INSERT INTO feedback (rating, comment, wallet_address, timestamp)
    VALUES (?, ?, ?, datetime('now'))
  `;

  // Save feedback
  db.run(query, [rating, comment, walletAddress || null], function(err) {
    if (err) {
      console.error('Error saving feedback:', err.message);
      return res.status(500).json({ error: 'Internal server error saving feedback' });
    }

    // Return success response
    res.status(201).json({
      message: 'Feedback submitted successfully',
      feedbackId: this.lastID
    });
  });
});

// API to fetch all feedback and statistics
app.get('/api/feedback', (req, res) => {
  const statsQuery = `SELECT COUNT(*) as count, AVG(rating) as avgRating FROM feedback`;
  const listQuery = `SELECT * FROM feedback ORDER BY timestamp DESC`;

  // Fetch statistics
  db.get(statsQuery, [], (err, stats) => {
    if (err) {
      console.error('Error running stats query:', err.message);
      return res.status(500).json({ error: 'Internal server error fetching stats' });
    }

    // Fetch feedback list
    db.all(listQuery, [], (err, rows) => {
      if (err) {
        console.error('Error running list query:', err.message);
        return res.status(500).json({ error: 'Internal server error fetching list' });
      }

      // Return statistics and feedback
      res.status(200).json({
        totalSubmissions: stats.count || 0,
        averageRating: stats.avgRating ? parseFloat(stats.avgRating.toFixed(2)) : 0,
        submissions: rows
      });
    });
  });
});

// Start Express server
app.listen(PORT, () => {
  console.log(`Feedback backend server running on port ${PORT}`);
});
