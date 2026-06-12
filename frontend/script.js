// API Base URL
const API_URL = 'http://localhost:5000/api';

// Get token from localStorage
const getToken = () => localStorage.getItem('token');
const getUser = () => JSON.parse(localStorage.getItem('user') || '{}');

// Check if user is logged in
function checkAuth() {
    const token = getToken();
    if (token) {
        const authButtons = document.getElementById('authButtons');
        const userMenu = document.getElementById('userMenu');
        if (authButtons) authButtons.style.display = 'none';
        if (userMenu) userMenu.style.display = 'block';
        const user = getUser();
        const userNameSpan = document.getElementById('userName');
        if (userNameSpan) userNameSpan.textContent = user.name || user.email;
        
        const dashboardLink = document.getElementById('dashboardLink');
        if (dashboardLink) {
            if (user.role === 'employer') {
                dashboardLink.href = 'employer-dashboard.html';
            } else {
                dashboardLink.href = 'jobseeker-dashboard.html';
            }
        }
    } else {
        const authButtons = document.getElementById('authButtons');
        const userMenu = document.getElementById('userMenu');
        if (authButtons) authButtons.style.display = 'flex';
        if (userMenu) userMenu.style.display = 'none';
    }
}

// Load jobs on homepage
async function loadJobs() {
    const keyword = document.getElementById('searchKeyword')?.value || '';
    const location = document.getElementById('searchLocation')?.value || '';
    const jobType = document.getElementById('searchJobType')?.value || 'all';
    
    let url = `${API_URL}/jobs?`;
    if (keyword) url += `keyword=${encodeURIComponent(keyword)}&`;
    if (location) url += `location=${encodeURIComponent(location)}&`;
    if (jobType !== 'all') url += `job_type=${jobType}&`;
    
    try {
        const response = await fetch(url);
        const jobs = await response.json();
        
        const jobsGrid = document.getElementById('jobsGrid');
        if (!jobsGrid) return;
        
        if (!jobs || jobs.length === 0) {
            jobsGrid.innerHTML = '<div style="text-align:center; padding:3rem;"><i class="fas fa-search" style="font-size:3rem; color:#667eea;"></i><h3>No jobs found</h3><p>Try different keywords or post a job!</p></div>';
            const totalJobs = document.getElementById('totalJobs');
            if (totalJobs) totalJobs.textContent = '0';
            return;
        }
        
        jobsGrid.innerHTML = jobs.map(job => `
            <div class="job-card" style="cursor:pointer;" onclick="viewJobDetails(${job.id})">
                <div class="job-header">
                    <h3 class="job-title">${escapeHtml(job.title)}</h3>
                    <span class="job-type">${job.job_type || 'Full-time'}</span>
                </div>
                <div class="job-company"><i class="fas fa-building"></i> ${escapeHtml(job.company)}</div>
                <div class="job-location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location)}</div>
                <div class="job-salary"><i class="fas fa-dollar-sign"></i> ${job.salary_min ? `$${job.salary_min} - $${job.salary_max}` : 'Competitive Salary'}</div>
                <div class="job-description">${escapeHtml((job.description || '').substring(0, 100))}...</div>
                <button class="btn-apply" onclick="event.stopPropagation(); viewJobDetails(${job.id})">View Details <i class="fas fa-arrow-right"></i></button>
            </div>
        `).join('');
        
        const totalJobs = document.getElementById('totalJobs');
        if (totalJobs) totalJobs.textContent = jobs.length;
        
    } catch (error) {
        console.error('Error loading jobs:', error);
        const jobsGrid = document.getElementById('jobsGrid');
        if (jobsGrid) {
            jobsGrid.innerHTML = '<div style="text-align:center; padding:3rem; color:red;"><i class="fas fa-exclamation-triangle"></i><h3>Backend Not Running</h3><p>Please start the backend server with: node server.js</p><p>Make sure you are in the backend folder</p></div>';
        }
    }
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// View job details
window.viewJobDetails = async function(jobId) {
    try {
        const response = await fetch(`${API_URL}/jobs/${jobId}`);
        const job = await response.json();
        
        const modalHtml = `
            <div id="jobDetailModal" class="modal" style="display:flex;">
                <div class="modal-content">
                    <span class="close-modal" onclick="document.getElementById('jobDetailModal').remove()">&times;</span>
                    <h2>${escapeHtml(job.title)}</h2>
                    <p><strong>${escapeHtml(job.company)}</strong> • ${escapeHtml(job.location)}</p>
                    <p><span class="job-type">${job.job_type}</span></p>
                    <p><strong>Salary:</strong> ${job.salary_min ? `$${job.salary_min} - $${job.salary_max}` : 'Competitive'}</p>
                    <hr>
                    <h3>Job Description</h3>
                    <p>${escapeHtml(job.description)}</p>
                    <h3>Requirements</h3>
                    <p>${escapeHtml(job.requirements)}</p>
                    <p><strong>Deadline:</strong> ${new Date(job.application_deadline).toLocaleDateString()}</p>
                    ${getToken() && getUser().role === 'jobseeker' ? `<button class="btn-primary" onclick="applyForJob(${job.id})" style="margin-top:1rem; width:100%;">Apply Now</button>` : 
                      !getToken() ? `<p style="margin-top:1rem;"><a href="login.html">Login</a> to apply for this job</p>` : `<p style="margin-top:1rem;">Only job seekers can apply for jobs</p>`}
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Close modal when clicking outside
        document.getElementById('jobDetailModal').addEventListener('click', function(e) {
            if (e.target === this) {
                this.remove();
            }
        });
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error loading job details. Make sure backend is running.');
    }
};

// Apply for job
window.applyForJob = async function(jobId) {
    const coverLetter = prompt('Write a brief cover letter (optional):');
    
    try {
        const response = await fetch(`${API_URL}/applications`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ 
                job_id: jobId, 
                cover_letter: coverLetter || '' 
            })
        });
        
        if (response.ok) {
            alert('✅ Application submitted successfully!');
            document.getElementById('jobDetailModal')?.remove();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to submit application');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error submitting application');
    }
};

// Register user
window.registerUser = async function(e) {
    e.preventDefault();
    
    const data = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        role: document.getElementById('role').value,
        phone: document.getElementById('phone')?.value || '',
        location: document.getElementById('location')?.value || '',
        skills: document.getElementById('skills')?.value || '',
        company: document.getElementById('company')?.value || ''
    };
    
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            alert('✅ Registration successful!');
            window.location.href = result.user.role === 'employer' ? 'employer-dashboard.html' : 'jobseeker-dashboard.html';
        } else {
            alert(result.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Registration failed');
    }
};

// Login user
window.loginUser = async function(e) {
    e.preventDefault();
    
    const data = {
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    };
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', result.token);
            localStorage.setItem('user', JSON.stringify(result.user));
            alert('✅ Login successful!');
            window.location.href = result.user.role === 'employer' ? 'employer-dashboard.html' : 'jobseeker-dashboard.html';
        } else {
            alert(result.error || 'Login failed');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Login failed');
    }
};

// Logout
window.logout = function() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
};

// ============ EMPLOYER DASHBOARD FUNCTIONS ============

// Post job
window.postJob = async function(e) {
    e.preventDefault();
    
    const data = {
        title: document.getElementById('jobTitle').value,
        location: document.getElementById('jobLocation').value,
        job_type: document.getElementById('jobType').value,
        salary_min: parseInt(document.getElementById('salaryMin')?.value) || null,
        salary_max: parseInt(document.getElementById('salaryMax')?.value) || null,
        description: document.getElementById('jobDescription').value,
        requirements: document.getElementById('jobRequirements').value,
        application_deadline: document.getElementById('deadline').value
    };
    
    try {
        const response = await fetch(`${API_URL}/jobs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            alert('✅ Job posted successfully!');
            document.getElementById('postJobForm')?.reset();
            loadEmployerJobs();
            // Switch to my jobs tab
            const myJobsBtn = document.querySelector('[data-tab="my-jobs"]');
            if (myJobsBtn) myJobsBtn.click();
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to post job');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to post job');
    }
};

// Load employer's jobs
window.loadEmployerJobs = async function() {
    try {
        const response = await fetch(`${API_URL}/my-jobs`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const jobs = await response.json();
        
        const container = document.getElementById('myJobsList');
        if (!container) return;
        
        if (!jobs || jobs.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:2rem;">📌 No jobs posted yet. Post your first job!</p>';
            return;
        }
        
        container.innerHTML = jobs.map(job => `
            <div class="job-card">
                <div class="job-header">
                    <h3>${escapeHtml(job.title)}</h3>
                    <span class="job-type">${job.job_type}</span>
                </div>
                <div class="job-location"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.location)}</div>
                <div class="job-salary">${job.salary_min ? `$${job.salary_min} - $${job.salary_max}` : 'Competitive'}</div>
                <div class="job-status">Status: <strong style="color:${job.status === 'active' ? 'green' : 'orange'}">${job.status}</strong></div>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                    <button class="btn-outline" onclick="editJob(${job.id})" style="padding:0.3rem 1rem;">Edit</button>
                    <button class="btn-outline" onclick="deleteJob(${job.id})" style="padding:0.3rem 1rem; border-color:#ff6b6b; color:#ff6b6b;">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error:', error);
    }
};

// Load applications for employer
window.loadApplications = async function() {
    try {
        const response = await fetch(`${API_URL}/job-applications`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const applications = await response.json();
        
        const container = document.getElementById('applicationsList');
        if (!container) return;
        
        if (!applications || applications.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:2rem;">📋 No applications received yet.</p>';
            return;
        }
        
        container.innerHTML = applications.map(app => `
            <div class="application-card" style="background:#f8f9fa; border-radius:10px; padding:1rem; margin-bottom:1rem;">
                <h4>${escapeHtml(app.job_title)}</h4>
                <p><strong>Candidate:</strong> ${escapeHtml(app.jobseeker_name)} (${app.jobseeker_email})</p>
                <p><strong>Skills:</strong> ${app.skills || 'Not specified'}</p>
                <p><strong>Status:</strong> 
                    <select onchange="updateApplicationStatus(${app.id}, this.value)" style="padding:0.3rem; border-radius:5px;">
                        <option value="pending" ${app.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="reviewed" ${app.status === 'reviewed' ? 'selected' : ''}>Reviewed</option>
                        <option value="shortlisted" ${app.status === 'shortlisted' ? 'selected' : ''}>Shortlisted</option>
                        <option value="rejected" ${app.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                        <option value="hired" ${app.status === 'hired' ? 'selected' : ''}>Hired</option>
                    </select>
                </p>
                ${app.cover_letter ? `<p><strong>Cover Letter:</strong> ${escapeHtml(app.cover_letter)}</p>` : ''}
                <p><small>Applied on: ${new Date(app.applied_at).toLocaleDateString()}</small></p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error:', error);
    }
};

// Edit job
window.editJob = async function(jobId) {
    try {
        const response = await fetch(`${API_URL}/jobs/${jobId}`);
        const job = await response.json();
        
        const modalHtml = `
            <div id="editJobModal" class="modal" style="display:flex;">
                <div class="modal-content">
                    <span class="close-modal" onclick="document.getElementById('editJobModal').remove()">&times;</span>
                    <h2>Edit Job</h2>
                    <form id="editJobForm">
                        <input type="hidden" id="editJobId" value="${job.id}">
                        <div class="form-group">
                            <label>Job Title</label>
                            <input type="text" id="editTitle" value="${escapeHtml(job.title)}" required>
                        </div>
                        <div class="form-group">
                            <label>Location</label>
                            <input type="text" id="editLocation" value="${escapeHtml(job.location)}" required>
                        </div>
                        <div class="form-group">
                            <label>Job Type</label>
                            <select id="editJobType">
                                <option value="Full-time" ${job.job_type === 'Full-time' ? 'selected' : ''}>Full-time</option>
                                <option value="Part-time" ${job.job_type === 'Part-time' ? 'selected' : ''}>Part-time</option>
                                <option value="Remote" ${job.job_type === 'Remote' ? 'selected' : ''}>Remote</option>
                                <option value="Contract" ${job.job_type === 'Contract' ? 'selected' : ''}>Contract</option>
                                <option value="Internship" ${job.job_type === 'Internship' ? 'selected' : ''}>Internship</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <textarea id="editDescription" rows="4" required>${escapeHtml(job.description)}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Requirements</label>
                            <textarea id="editRequirements" rows="3" required>${escapeHtml(job.requirements)}</textarea>
                        </div>
                        <div class="form-group">
                            <label>Status</label>
                            <select id="editStatus">
                                <option value="active" ${job.status === 'active' ? 'selected' : ''}>Active</option>
                                <option value="filled" ${job.status === 'filled' ? 'selected' : ''}>Filled</option>
                                <option value="closed" ${job.status === 'closed' ? 'selected' : ''}>Closed</option>
                            </select>
                        </div>
                        <button type="submit" class="btn-primary">Save Changes</button>
                    </form>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('editJobForm').onsubmit = async function(e) {
            e.preventDefault();
            const updateData = {
                title: document.getElementById('editTitle').value,
                location: document.getElementById('editLocation').value,
                job_type: document.getElementById('editJobType').value,
                description: document.getElementById('editDescription').value,
                requirements: document.getElementById('editRequirements').value,
                status: document.getElementById('editStatus').value
            };
            
            const updateResponse = await fetch(`${API_URL}/jobs/${jobId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(updateData)
            });
            
            if (updateResponse.ok) {
                alert('✅ Job updated successfully!');
                document.getElementById('editJobModal').remove();
                loadEmployerJobs();
            } else {
                alert('Failed to update job');
            }
        };
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error loading job details');
    }
};

// Delete job
window.deleteJob = async function(jobId) {
    if (confirm('Are you sure you want to delete this job?')) {
        try {
            const response = await fetch(`${API_URL}/jobs/${jobId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            
            if (response.ok) {
                alert('✅ Job deleted successfully!');
                loadEmployerJobs();
            } else {
                alert('Failed to delete job');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error deleting job');
        }
    }
};

// Update application status
window.updateApplicationStatus = async function(appId, status) {
    try {
        const response = await fetch(`${API_URL}/applications/${appId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ status })
        });
        
        if (response.ok) {
            alert('✅ Status updated!');
            loadApplications();
        } else {
            alert('Failed to update status');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error updating status');
    }
};

// Load job seeker's applications
window.loadJobSeekerApplications = async function() {
    try {
        const response = await fetch(`${API_URL}/my-applications`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const applications = await response.json();
        
        const container = document.getElementById('applicationsList');
        if (!container) return;
        
        if (!applications || applications.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:2rem;">📝 You haven\'t applied to any jobs yet.</p>';
            return;
        }
        
        container.innerHTML = applications.map(app => `
            <div class="application-card" style="background:#f8f9fa; border-radius:10px; padding:1rem; margin-bottom:1rem;">
                <h4>${escapeHtml(app.title)}</h4>
                <p><strong>Company:</strong> ${escapeHtml(app.company)}</p>
                <p><strong>Location:</strong> ${escapeHtml(app.location)}</p>
                <p><strong>Status:</strong> <span style="background:${app.status === 'hired' ? 'green' : app.status === 'rejected' ? 'red' : 'orange'}; color:white; padding:0.2rem 0.5rem; border-radius:5px;">${app.status.toUpperCase()}</span></p>
                <p><strong>Applied on:</strong> ${new Date(app.applied_at).toLocaleDateString()}</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error:', error);
    }
};

// Load user profile
window.loadProfile = async function() {
    try {
        const response = await fetch(`${API_URL}/profile`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const profile = await response.json();
        
        const user = getUser();
        if (user.role === 'employer') {
            const companyInput = document.getElementById('profileCompany');
            const phoneInput = document.getElementById('profilePhone');
            const locationInput = document.getElementById('profileLocation');
            if (companyInput) companyInput.value = profile.company || '';
            if (phoneInput) phoneInput.value = profile.phone || '';
            if (locationInput) locationInput.value = profile.location || '';
            const companyNameSpan = document.getElementById('companyName');
            if (companyNameSpan) companyNameSpan.textContent = profile.company || 'Your Company';
            const employerEmailSpan = document.getElementById('employerEmail');
            if (employerEmailSpan) employerEmailSpan.textContent = profile.email;
        } else {
            const nameInput = document.getElementById('profileName');
            const phoneInput = document.getElementById('profilePhone');
            const locationInput = document.getElementById('profileLocation');
            const skillsInput = document.getElementById('profileSkills');
            if (nameInput) nameInput.value = profile.name || '';
            if (phoneInput) phoneInput.value = profile.phone || '';
            if (locationInput) locationInput.value = profile.location || '';
            if (skillsInput) skillsInput.value = profile.skills || '';
            const jobseekerNameSpan = document.getElementById('jobseekerName');
            if (jobseekerNameSpan) jobseekerNameSpan.textContent = profile.name;
            const jobseekerEmailSpan = document.getElementById('jobseekerEmail');
            if (jobseekerEmailSpan) jobseekerEmailSpan.textContent = profile.email;
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }
};

// Update profile
window.updateProfile = async function(e) {
    e.preventDefault();
    const user = getUser();
    
    const data = {};
    if (user.role === 'employer') {
        data.company = document.getElementById('profileCompany')?.value || '';
        data.phone = document.getElementById('profilePhone')?.value || '';
        data.location = document.getElementById('profileLocation')?.value || '';
    } else {
        data.name = document.getElementById('profileName')?.value || '';
        data.phone = document.getElementById('profilePhone')?.value || '';
        data.location = document.getElementById('profileLocation')?.value || '';
        data.skills = document.getElementById('profileSkills')?.value || '';
    }
    
    try {
        const response = await fetch(`${API_URL}/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            alert('✅ Profile updated successfully!');
            loadProfile();
        } else {
            alert('Failed to update profile');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to update profile');
    }
};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    // Homepage
    if (document.getElementById('jobsGrid')) {
        checkAuth();
        loadJobs();
        
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                loadJobs();
            });
        }
        
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', logout);
        
        // Enter key search
        const searchKeyword = document.getElementById('searchKeyword');
        if (searchKeyword) {
            searchKeyword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') loadJobs();
            });
        }
        
        const searchLocation = document.getElementById('searchLocation');
        if (searchLocation) {
            searchLocation.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') loadJobs();
            });
        }
        
        // Category filters
        document.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', () => {
                const jobType = card.dataset.jobType;
                const jobTypeSelect = document.getElementById('searchJobType');
                if (jobType && jobTypeSelect) {
                    jobTypeSelect.value = jobType;
                    loadJobs();
                    const featuredSection = document.querySelector('.featured-jobs');
                    if (featuredSection) {
                        featuredSection.scrollIntoView({ behavior: 'smooth' });
                    }
                }
            });
        });
    }
    
    // Login page
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', loginUser);
    }
    
    // Register page
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', registerUser);
        
        const roleSelect = document.getElementById('role');
        if (roleSelect) {
            roleSelect.addEventListener('change', function() {
                const isEmployer = this.value === 'employer';
                const employerFields = document.getElementById('employerFields');
                const jobseekerFields = document.getElementById('jobseekerFields');
                if (employerFields) employerFields.style.display = isEmployer ? 'block' : 'none';
                if (jobseekerFields) jobseekerFields.style.display = isEmployer ? 'none' : 'block';
            });
        }
    }
    
    // Employer dashboard
    if (document.querySelector('.dashboard-menu') && window.location.pathname.includes('employer')) {
        checkAuth();
        
        // Tab switching
        document.querySelectorAll('.menu-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                const activeTab = document.getElementById(tabId);
                if (activeTab) activeTab.classList.add('active');
                
                if (tabId === 'my-jobs') loadEmployerJobs();
                if (tabId === 'applications') loadApplications();
                if (tabId === 'profile') loadProfile();
            });
        });
        
        const postJobForm = document.getElementById('postJobForm');
        if (postJobForm) postJobForm.addEventListener('submit', postJob);
        
        const updateProfileForm = document.getElementById('updateProfileForm');
        if (updateProfileForm) updateProfileForm.addEventListener('submit', updateProfile);
        
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', logout);
        
        // Load initial data
        loadEmployerJobs();
        loadProfile();
    }
    
    // Job seeker dashboard
    if (document.getElementById('my-applications') && window.location.pathname.includes('jobseeker')) {
        checkAuth();
        loadJobSeekerApplications();
        loadProfile();
        
        document.querySelectorAll('.menu-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
                btn.classList.add('active');
                const activeTab = document.getElementById(tabId);
                if (activeTab) activeTab.classList.add('active');
                
                if (tabId === 'my-applications') loadJobSeekerApplications();
                if (tabId === 'profile') loadProfile();
            });
        });
        
        const updateProfileForm = document.getElementById('updateProfileForm');
        if (updateProfileForm) updateProfileForm.addEventListener('submit', updateProfile);
        
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', logout);
    }
});