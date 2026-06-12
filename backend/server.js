const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'your_jwt_secret_key_change_this';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// Database
const db = new sqlite3.Database('./database/jobs.db');

// Create tables
db.serialize(() => {
    // Users table
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

    // Jobs table
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employer_id) REFERENCES users(id)
    )`);

    // Applications table
    db.run(`CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        jobseeker_id INTEGER NOT NULL,
        cover_letter TEXT,
        status TEXT DEFAULT 'pending',
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id),
        FOREIGN KEY (jobseeker_id) REFERENCES users(id),
        UNIQUE(job_id, jobseeker_id)
    )`);

    console.log('✅ Database tables ready');
});

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

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
};

// ============ AUTH ROUTES ============
app.post('/api/register', async (req, res) => {
    const { name, email, password, role, phone, location, skills, company } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(`INSERT INTO users (name, email, password, role, phone, location, skills, company)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, email, hashedPassword, role, phone || null, location || null, skills || null, company || null],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'Email already exists' });
                    }
                    return res.status(500).json({ error: err.message });
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
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email, role: user.role, company: user.company } });
    });
});

app.get('/api/profile', authenticate, (req, res) => {
    db.get('SELECT id, name, email, role, phone, location, skills, company FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(user);
    });
});

app.put('/api/profile', authenticate, (req, res) => {
    const { name, phone, location, skills, company } = req.body;
    const updates = [];
    const values = [];

    if (name) { updates.push('name = ?'); values.push(name); }
    if (phone) { updates.push('phone = ?'); values.push(phone); }
    if (location) { updates.push('location = ?'); values.push(location); }
    if (skills) { updates.push('skills = ?'); values.push(skills); }
    if (company && req.user.role === 'employer') { updates.push('company = ?'); values.push(company); }

    if (updates.length === 0) return res.json({ message: 'No changes' });

    values.push(req.user.id);
    db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Profile updated' });
    });
});

// ============ JOB ROUTES ============
app.post('/api/jobs', authenticate, authorize('employer'), (req, res) => {
    const { title, description, requirements, location, job_type, salary_min, salary_max, deadline } = req.body;

    if (!title || !description || !requirements || !location || !job_type || !deadline) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    db.get('SELECT company FROM users WHERE id = ?', [req.user.id], (err, user) => {
        const company = user?.company || 'Company';
        
        db.run(`INSERT INTO jobs (employer_id, title, company, description, requirements, location, job_type, salary_min, salary_max, deadline)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, title, company, description, requirements, location, job_type, salary_min || null, salary_max || null, deadline],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Job posted', jobId: this.lastID });
            }
        );
    });
});

app.get('/api/jobs', (req, res) => {
    const { keyword, location, job_type } = req.query;
    let query = 'SELECT j.*, u.name as employer_name FROM jobs j JOIN users u ON j.employer_id = u.id WHERE j.status = "active"';
    let params = [];

    if (keyword) {
        query += ' AND (j.title LIKE ? OR j.company LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (location) {
        query += ' AND j.location LIKE ?';
        params.push(`%${location}%`);
    }
    if (job_type && job_type !== 'all') {
        query += ' AND j.job_type = ?';
        params.push(job_type);
    }

    query += ' ORDER BY j.created_at DESC';

    db.all(query, params, (err, jobs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(jobs);
    });
});

app.get('/api/jobs/:id', (req, res) => {
    db.get('SELECT * FROM jobs WHERE id = ?', [req.params.id], (err, job) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!job) return res.status(404).json({ error: 'Job not found' });
        res.json(job);
    });
});

app.put('/api/jobs/:id', authenticate, authorize('employer'), (req, res) => {
    db.get('SELECT employer_id FROM jobs WHERE id = ?', [req.params.id], (err, job) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!job) return res.status(404).json({ error: 'Job not found' });
        if (job.employer_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

        const { title, description, requirements, location, job_type, salary_min, salary_max, deadline, status } = req.body;
        
        db.run(`UPDATE jobs SET title = COALESCE(?, title), description = COALESCE(?, description), requirements = COALESCE(?, requirements),
                location = COALESCE(?, location), job_type = COALESCE(?, job_type), salary_min = COALESCE(?, salary_min),
                salary_max = COALESCE(?, salary_max), deadline = COALESCE(?, deadline), status = COALESCE(?, status)
                WHERE id = ?`,
            [title, description, requirements, location, job_type, salary_min, salary_max, deadline, status, req.params.id],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Job updated' });
            });
    });
});

app.delete('/api/jobs/:id', authenticate, authorize('employer'), (req, res) => {
    db.get('SELECT employer_id FROM jobs WHERE id = ?', [req.params.id], (err, job) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!job) return res.status(404).json({ error: 'Job not found' });
        if (job.employer_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

        db.run('DELETE FROM jobs WHERE id = ?', [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Job deleted' });
        });
    });
});

app.get('/api/my-jobs', authenticate, authorize('employer'), (req, res) => {
    db.all('SELECT * FROM jobs WHERE employer_id = ? ORDER BY created_at DESC', [req.user.id], (err, jobs) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(jobs);
    });
});

// ============ APPLICATION ROUTES ============
app.post('/api/applications', authenticate, authorize('jobseeker'), (req, res) => {
    const { job_id, cover_letter } = req.body;

    db.get('SELECT id FROM applications WHERE job_id = ? AND jobseeker_id = ?', [job_id, req.user.id], (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existing) return res.status(400).json({ error: 'Already applied' });

        db.run(`INSERT INTO applications (job_id, jobseeker_id, cover_letter) VALUES (?, ?, ?)`,
            [job_id, req.user.id, cover_letter || null],
            function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Application submitted' });
            });
    });
});

app.get('/api/my-applications', authenticate, authorize('jobseeker'), (req, res) => {
    db.all(`SELECT a.*, j.title, j.company, j.location, j.job_type 
            FROM applications a 
            JOIN jobs j ON a.job_id = j.id 
            WHERE a.jobseeker_id = ? 
            ORDER BY a.applied_at DESC`, [req.user.id], (err, apps) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(apps);
    });
});

app.get('/api/job-applications', authenticate, authorize('employer'), (req, res) => {
    db.all(`SELECT a.*, u.name as jobseeker_name, u.email as jobseeker_email, u.skills, j.title as job_title
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            JOIN users u ON a.jobseeker_id = u.id
            WHERE j.employer_id = ?
            ORDER BY a.applied_at DESC`, [req.user.id], (err, apps) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(apps);
    });
});

app.put('/api/applications/:id/status', authenticate, authorize('employer'), (req, res) => {
    const { status } = req.body;
    
    db.run('UPDATE applications SET status = ? WHERE id = ?', [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Status updated' });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Database: ./database/jobs.db`);
});