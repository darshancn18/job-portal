const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'your_jwt_secret_key';

app.use(cors());
app.use(express.json());

// JSON file paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const APPLICATIONS_FILE = path.join(DATA_DIR, 'applications.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize data files
function initDataFiles() {
    if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([]));
    if (!fs.existsSync(JOBS_FILE)) fs.writeFileSync(JOBS_FILE, JSON.stringify([]));
    if (!fs.existsSync(APPLICATIONS_FILE)) fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify([]));
}
initDataFiles();

function readUsers() { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
function writeUsers(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }
function readJobs() { return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')); }
function writeJobs(jobs) { fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2)); }
function readApplications() { return JSON.parse(fs.readFileSync(APPLICATIONS_FILE, 'utf8')); }
function writeApplications(apps) { fs.writeFileSync(APPLICATIONS_FILE, JSON.stringify(apps, null, 2)); }

// Auth middleware
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

// Register
app.post('/api/register', async (req, res) => {
    const { name, email, password, role, phone, location, skills, company } = req.body;
    const users = readUsers();
    if (users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'Email already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: Date.now(),
        name,
        email,
        password: hashedPassword,
        role,
        phone: phone || '',
        location: location || '',
        skills: skills || '',
        company: company || '',
        createdAt: new Date().toISOString()
    };
    users.push(newUser);
    writeUsers(users);
    const token = jwt.sign({ id: newUser.id, email, role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Registration successful', token, user: { id: newUser.id, name, email, role } });
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const users = readUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// Get profile
app.get('/api/profile', authenticate, (req, res) => {
    const users = readUsers();
    const user = users.find(u => u.id === req.user.id);
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, location: user.location, skills: user.skills, company: user.company });
});

// Update profile
app.put('/api/profile', authenticate, (req, res) => {
    const { name, phone, location, skills, company } = req.body;
    const users = readUsers();
    const userIndex = users.findIndex(u => u.id === req.user.id);
    if (userIndex === -1) return res.status(404).json({ error: 'User not found' });
    if (name) users[userIndex].name = name;
    if (phone) users[userIndex].phone = phone;
    if (location) users[userIndex].location = location;
    if (skills) users[userIndex].skills = skills;
    if (company && users[userIndex].role === 'employer') users[userIndex].company = company;
    writeUsers(users);
    res.json({ message: 'Profile updated' });
});

// Post job (Employer only)
app.post('/api/jobs', authenticate, (req, res) => {
    if (req.user.role !== 'employer') {
        return res.status(403).json({ error: 'Only employers can post jobs' });
    }
    const { title, description, requirements, location, job_type, salary_min, salary_max, deadline } = req.body;
    const users = readUsers();
    const employer = users.find(u => u.id === req.user.id);
    const newJob = {
        id: Date.now(),
        employer_id: req.user.id,
        company: employer?.company || 'Company',
        title,
        description,
        requirements,
        location,
        job_type,
        salary_min: salary_min || null,
        salary_max: salary_max || null,
        deadline,
        status: 'active',
        created_at: new Date().toISOString()
    };
    const jobs = readJobs();
    jobs.push(newJob);
    writeJobs(jobs);
    res.json({ message: 'Job posted', jobId: newJob.id });
});

// Get all jobs (with filters)
app.get('/api/jobs', (req, res) => {
    let jobs = readJobs();
    const { keyword, location, job_type } = req.query;
    jobs = jobs.filter(j => j.status === 'active');
    if (keyword) {
        jobs = jobs.filter(j => j.title.toLowerCase().includes(keyword.toLowerCase()) || 
                              j.company.toLowerCase().includes(keyword.toLowerCase()));
    }
    if (location) {
        jobs = jobs.filter(j => j.location.toLowerCase().includes(location.toLowerCase()));
    }
    if (job_type && job_type !== 'all') {
        jobs = jobs.filter(j => j.job_type === job_type);
    }
    res.json(jobs.reverse());
});

// Get single job
app.get('/api/jobs/:id', (req, res) => {
    const jobs = readJobs();
    const job = jobs.find(j => j.id === parseInt(req.params.id));
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

// Get my jobs (Employer)
app.get('/api/my-jobs', authenticate, (req, res) => {
    if (req.user.role !== 'employer') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    const jobs = readJobs();
    const myJobs = jobs.filter(j => j.employer_id === req.user.id);
    res.json(myJobs);
});

// Update job
app.put('/api/jobs/:id', authenticate, (req, res) => {
    const { title, description, requirements, location, job_type, salary_min, salary_max, deadline, status } = req.body;
    let jobs = readJobs();
    const jobIndex = jobs.findIndex(j => j.id === parseInt(req.params.id));
    if (jobIndex === -1) return res.status(404).json({ error: 'Job not found' });
    if (jobs[jobIndex].employer_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
    if (title) jobs[jobIndex].title = title;
    if (description) jobs[jobIndex].description = description;
    if (requirements) jobs[jobIndex].requirements = requirements;
    if (location) jobs[jobIndex].location = location;
    if (job_type) jobs[jobIndex].job_type = job_type;
    if (salary_min) jobs[jobIndex].salary_min = salary_min;
    if (salary_max) jobs[jobIndex].salary_max = salary_max;
    if (deadline) jobs[jobIndex].deadline = deadline;
    if (status) jobs[jobIndex].status = status;
    writeJobs(jobs);
    res.json({ message: 'Job updated' });
});

// Delete job
app.delete('/api/jobs/:id', authenticate, (req, res) => {
    let jobs = readJobs();
    const jobIndex = jobs.findIndex(j => j.id === parseInt(req.params.id));
    if (jobIndex === -1) return res.status(404).json({ error: 'Job not found' });
    if (jobs[jobIndex].employer_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });
    jobs.splice(jobIndex, 1);
    writeJobs(jobs);
    res.json({ message: 'Job deleted' });
});

// Apply for job (Job Seeker only)
app.post('/api/applications', authenticate, (req, res) => {
    if (req.user.role !== 'jobseeker') {
        return res.status(403).json({ error: 'Only job seekers can apply' });
    }
    const { job_id, cover_letter } = req.body;
    const applications = readApplications();
    if (applications.find(a => a.job_id === job_id && a.jobseeker_id === req.user.id)) {
        return res.status(400).json({ error: 'Already applied' });
    }
    const newApp = {
        id: Date.now(),
        job_id,
        jobseeker_id: req.user.id,
        cover_letter: cover_letter || '',
        status: 'pending',
        applied_at: new Date().toISOString()
    };
    applications.push(newApp);
    writeApplications(applications);
    res.json({ message: 'Application submitted' });
});

// Get my applications (Job Seeker)
app.get('/api/my-applications', authenticate, (req, res) => {
    const applications = readApplications();
    const jobs = readJobs();
    const myApps = applications.filter(a => a.jobseeker_id === req.user.id);
    const result = myApps.map(app => {
        const job = jobs.find(j => j.id === app.job_id);
        return { ...app, title: job?.title, company: job?.company, location: job?.location };
    });
    res.json(result);
});

// Get applications for my jobs (Employer)
app.get('/api/job-applications', authenticate, (req, res) => {
    if (req.user.role !== 'employer') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    const applications = readApplications();
    const jobs = readJobs();
    const users = readUsers();
    const myJobs = jobs.filter(j => j.employer_id === req.user.id);
    const myJobIds = myJobs.map(j => j.id);
    const myApps = applications.filter(a => myJobIds.includes(a.job_id));
    const result = myApps.map(app => {
        const job = jobs.find(j => j.id === app.job_id);
        const user = users.find(u => u.id === app.jobseeker_id);
        return {
            ...app,
            job_title: job?.title,
            jobseeker_name: user?.name,
            jobseeker_email: user?.email,
            jobseeker_skills: user?.skills
        };
    });
    res.json(result);
});

// Update application status (Employer)
app.put('/api/applications/:id/status', authenticate, (req, res) => {
    if (req.user.role !== 'employer') {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    const { status } = req.body;
    let applications = readApplications();
    const appIndex = applications.findIndex(a => a.id === parseInt(req.params.id));
    if (appIndex === -1) return res.status(404).json({ error: 'Application not found' });
    applications[appIndex].status = status;
    writeApplications(applications);
    res.json({ message: 'Status updated' });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});