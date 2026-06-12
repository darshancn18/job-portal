const express = require('express');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Middleware
app.use(cors());
app.use(express.json());

// Database setup - using memory first then file
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Database error:', err);
    } else {
        console.log('Connected to SQLite database');
        createTables();
    }
});

function createTables() {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT CHECK(role IN ('jobseeker', 'employer')) NOT NULL,
        phone TEXT,
        location TEXT,
        skills TEXT,
        company TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employer_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        description TEXT NOT NULL,
        requirements TEXT NOT NULL,
        location TEXT NOT NULL,
        job_type TEXT NOT NULL,
        salary_min INTEGER,
        salary_max INTEGER,
        deadline DATE NOT NULL,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        jobseeker_id INTEGER NOT NULL,
        cover_letter TEXT,
        status TEXT DEFAULT 'pending',
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('Tables ready');
}

// ============ AUTH MIDDLEWARE ============
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ============ AUTH ROUTES ============
app.post('/api/register', async (req, res) => {
    const { name, email, password, role, phone, location, skills, company } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(`INSERT INTO users (name, email, password, role, phone, location, skills, company)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, email, hashedPassword, role, phone || null, location || null, skills || null, company || null],
            function(err) {
                if (err) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                const token = jwt.sign({ id: this.lastID, email, role }, JWT_SECRET, { expiresIn: '7d' });
                res.json({ message: 'Registration successful', token, user: { id: this.lastID, name, email, role } });
            }
        );
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email, role: user.role, company: user.company } });
    });
});

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// ============ JOB ROUTES ============
app.post('/api/jobs', authenticate, (req, res) => {
    if (req.user.role !== 'employer') {
        return res.status(403).json({ error: 'Only employers can post jobs' });
    }

    const { title, description, requirements, location, job_type, salary_min, salary_max, deadline } = req.body;

    db.run(`INSERT INTO jobs (employer_id, title, company, description, requirements, location, job_type, salary_min, salary_max, deadline)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, title, 'Company', description, requirements, location, job_type, salary_min || null, salary_max || null, deadline],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Job posted', jobId: this.lastID });
        }
    );
});

app.get('/api/jobs', (req, res) => {
    const { keyword, location, job_type } = req.query;
    let query = 'SELECT * FROM jobs WHERE status = "active"';
    let params = [];

    if (keyword) {
        query += ' AND title LIKE ?';
        params.push(`%${keyword}%`);
    }
    if (location) {
        query += ' AND location LIKE ?';
        params.push(`%${location}%`);
    }
    if (job_type && job_type !== 'all') {
        query += ' AND job_type = ?';
        params.push(job_type);
    }

    db.all(query, params, (err, jobs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(jobs);
    });
});

app.post('/api/applications', authenticate, (req, res) => {
    if (req.user.role !== 'jobseeker') {
        return res.status(403).json({ error: 'Only job seekers can apply' });
    }

    const { job_id, cover_letter } = req.body;

    db.run(`INSERT INTO applications (job_id, jobseeker_id, cover_letter) VALUES (?, ?, ?)`,
        [job_id, req.user.id, cover_letter || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Application submitted' });
        }
    );
});

app.get('/api/my-applications', authenticate, (req, res) => {
    db.all(`SELECT a.*, j.title, j.company FROM applications a JOIN jobs j ON a.job_id = j.id WHERE a.jobseeker_id = ?`, 
        [req.user.id], (err, apps) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(apps);
        });
});

app.get('/api/my-jobs', authenticate, (req, res) => {
    if (req.user.role !== 'employer') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    db.all('SELECT * FROM jobs WHERE employer_id = ?', [req.user.id], (err, jobs) => {
        res.json(jobs);
    });
});

app.delete('/api/jobs/:id', authenticate, (req, res) => {
    db.run('DELETE FROM jobs WHERE id = ? AND employer_id = ?', [req.params.id, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Job deleted' });
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});