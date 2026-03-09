// Global variable for tracking selected complaint
var selectedComplaintIndex = -1;

// Global variables for filtering and sorting
let currentFilter = "all";
let currentSearch = "";
let sortByPriorityFlag = false;
let currentViewMode = "govt";
const THEME_KEY = "uiTheme";

document.addEventListener("DOMContentLoaded", function () {
    initializeTheme();
    attachThemeToggle();
});

// ---------- Core Storage Helpers ----------
function getCurrentUser() {
    return JSON.parse(localStorage.getItem("currentUser"));
}

function isGovtUser() {
    let currentUser = getCurrentUser();
    return currentUser && currentUser.role === "govt";
}

function saveComplaints(complaints) {
    localStorage.setItem("complaints", JSON.stringify(complaints));
}

function getNotificationsMap() {
    return JSON.parse(localStorage.getItem("notificationsByUser")) || {};
}

function saveNotificationsMap(map) {
    localStorage.setItem("notificationsByUser", JSON.stringify(map));
}

function addNotification(userID, message, complaintID, type) {
    if (!userID) return;
    let notifications = getNotificationsMap();
    if (!notifications[userID]) {
        notifications[userID] = [];
    }

    notifications[userID].unshift({
        id: "NTF-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        message: message,
        complaintID: complaintID || "",
        type: type || "info",
        timestamp: new Date().toISOString(),
        read: false
    });

    notifications[userID] = notifications[userID].slice(0, 60);
    saveNotificationsMap(notifications);
}

function getUserNotifications(userID) {
    let notifications = getNotificationsMap();
    return notifications[userID] || [];
}

function markAllNotificationsRead(userID) {
    if (!userID) return;
    let notifications = getNotificationsMap();
    if (!notifications[userID]) return;
    notifications[userID] = notifications[userID].map(n => ({ ...n, read: true }));
    saveNotificationsMap(notifications);
}

function createTimelineEvent(type, userID, message) {
    return {
        type: type,
        userID: userID || "SYSTEM",
        message: message,
        timestamp: new Date().toISOString()
    };
}

function notifyComplaintStakeholders(complaint, message, type) {
    addNotification(complaint.userID, message, complaint.complaintID, type);
    (complaint.supportByUsers || []).forEach(uid => {
        if (uid !== complaint.userID) {
            addNotification(uid, message, complaint.complaintID, type);
        }
    });
}

function ensureComplaintDefaults(complaint) {
    // Keep backward compatibility with older stored complaint objects.
    complaint.category = complaint.category || "General";
    complaint.area = complaint.area || "Not provided";
    complaint.city = complaint.city || "Not provided";
    complaint.supportCount = typeof complaint.supportCount === "number" ? complaint.supportCount : 0;
    complaint.supportByUsers = Array.isArray(complaint.supportByUsers) ? complaint.supportByUsers : [];
    complaint.submittedDate = complaint.submittedDate || new Date().toISOString();
    complaint.resolvedDate = complaint.resolvedDate || "";
    complaint.comments = Array.isArray(complaint.comments) ? complaint.comments : [];
    complaint.timeline = Array.isArray(complaint.timeline) ? complaint.timeline : [];
    complaint.officialNotes = Array.isArray(complaint.officialNotes) ? complaint.officialNotes : [];

    // Ensure supportCount matches unique supporters.
    complaint.supportByUsers = [...new Set(complaint.supportByUsers)];
    complaint.supportCount = complaint.supportByUsers.length;

    if (complaint.timeline.length === 0) {
        complaint.timeline.push(
            createTimelineEvent(
                "submitted",
                complaint.userID,
                `Complaint submitted with status ${complaint.status || "Submitted"}`
            )
        );
    }

    return complaint;
}

function getComplaints() {
    let complaints = JSON.parse(localStorage.getItem("complaints")) || [];
    complaints = complaints.map(ensureComplaintDefaults);
    saveComplaints(complaints);
    return complaints;
}

function getActivityLog() {
    return JSON.parse(localStorage.getItem("govtActivityLog")) || [];
}

function saveActivityLog(logEntries) {
    localStorage.setItem("govtActivityLog", JSON.stringify(logEntries));
}

function addGovtActivity(complaintID, actionText) {
    let currentUser = getCurrentUser();
    let officialID = currentUser ? currentUser.userID : "Unknown";

    let logEntries = getActivityLog();
    logEntries.push({
        timestamp: new Date().toISOString(),
        officialID: officialID,
        complaintID: complaintID,
        action: actionText
    });

    saveActivityLog(logEntries);
}

function getResolutionDays(complaint) {
    if (!complaint.submittedDate || !complaint.resolvedDate || complaint.status !== "Resolved") {
        return "-";
    }

    let submitted = new Date(complaint.submittedDate);
    let resolved = new Date(complaint.resolvedDate);
    let diffMs = resolved.getTime() - submitted.getTime();
    let days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return `${days} day${days === 1 ? "" : "s"}`;
}

function formatDateTime(isoDate) {
    if (!isoDate) return "-";
    return new Date(isoDate).toLocaleString();
}

// ---------- ID Generation ----------
function getUserId() {
    let lastID = localStorage.getItem("lastUserID");
    if (lastID == null) {
        lastID = 1000;
    } else {
        lastID = parseInt(lastID, 10);
    }

    let newID = lastID + 1;
    localStorage.setItem("lastUserID", newID);
    return "USR-" + newID;
}

function getComplaintId() {
    let lastID = localStorage.getItem("lastComplaintNumber");

    if (lastID == null) {
        // Backward compatibility: older versions stored "CMP-xxxx" in lastComplaintID
        let legacyId = localStorage.getItem("lastComplaintID");
        if (legacyId) {
            let parsedLegacy = parseInt(String(legacyId).replace("CMP-", ""), 10);
            if (!isNaN(parsedLegacy)) {
                lastID = parsedLegacy;
            }
        }
    } else {
        lastID = parseInt(lastID, 10);
    }

    if (lastID == null || isNaN(lastID)) {
        // Fallback: derive from existing complaints if counter is missing
        let complaints = getComplaints();
        let maxExisting = 2000;
        complaints.forEach(c => {
            let n = parseInt(String(c.complaintID || "").replace("CMP-", ""), 10);
            if (!isNaN(n) && n > maxExisting) {
                maxExisting = n;
            }
        });
        lastID = maxExisting;
    }

    let newID = lastID + 1;
    let complaintID = "CMP-" + newID;

    localStorage.setItem("lastComplaintNumber", newID);
    localStorage.setItem("lastComplaintID", complaintID);

    return complaintID;
}

function viewAllComplaints() {
    if (isGovtUser()) {
        window.location.href = "govtDashboard.html";
        return;
    }

    window.location.href = "publicTransparency.html";
}

// ---------- Auth ----------
function registerUser() {
    let name = document.getElementById("name").value;
    let password = document.getElementById("password").value;
    let role = document.getElementById("role").value;

    let userID = getUserId();

    let users = JSON.parse(localStorage.getItem("users")) || [];
    users.push({ userID, name, password, role });

    localStorage.setItem("users", JSON.stringify(users));
    localStorage.setItem("lastRegisteredUser", userID);

    window.location.href = "registrationSuccess.html";
}

function loginUser() {
    let userID = document.getElementById("userID").value.trim();
    let password = document.getElementById("password").value;

    let users = JSON.parse(localStorage.getItem("users")) || [];

    let validUser = users.find(
        u => u.userID === userID && u.password === password
    );

    if (!validUser) {
        alert("Invalid User ID or Password");
        return;
    }

    localStorage.setItem("currentUser", JSON.stringify(validUser));

    alert("Login Successful");

    if (validUser.role === "govt") {
        window.location.href = "govtDashboard.html";
    } else {
        window.location.href = "citizenDashboard.html";
    }
}

// ---------- Complaint Create ----------
function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function calculateTextSimilarity(a, b) {
    let aTokens = new Set(normalizeText(a).split(" ").filter(Boolean));
    let bTokens = new Set(normalizeText(b).split(" ").filter(Boolean));
    if (aTokens.size === 0 || bTokens.size === 0) return 0;

    let common = 0;
    aTokens.forEach(token => {
        if (bTokens.has(token)) common++;
    });

    return common / Math.max(aTokens.size, bTokens.size);
}

function findDuplicateComplaint(complaints, category, area, city, problem) {
    let targetArea = normalizeText(area);
    let targetCity = normalizeText(city);

    return complaints.find(c => {
        let sameCategory = c.category === category;
        let sameArea = normalizeText(c.area) === targetArea;
        let sameCity = normalizeText(c.city) === targetCity;
        let similarity = calculateTextSimilarity(c.problem, problem);
        return sameCategory && sameArea && sameCity && similarity >= 0.4;
    });
}

function supportExistingComplaintFromSubmission(complaint, userID) {
    if (!complaint || !userID) return false;
    let users = JSON.parse(localStorage.getItem("users")) || [];
    let supporter = users.find(u => String(u.userID).toUpperCase() === String(userID).toUpperCase());
    if (!supporter || supporter.role === "govt" || complaint.status === "Resolved") {
        return false;
    }

    let normalizedID = String(userID).toUpperCase();
    if (!complaint.supportByUsers.includes(normalizedID)) {
        complaint.supportByUsers.push(normalizedID);
        complaint.supportByUsers = [...new Set(complaint.supportByUsers)];
        complaint.supportCount = complaint.supportByUsers.length;
        complaint.timeline.push(createTimelineEvent("support", normalizedID, `Complaint supported by ${normalizedID}`));
        addNotification(complaint.userID, `${normalizedID} supported your complaint ${complaint.complaintID}.`, complaint.complaintID, "support");
    }

    return true;
}

function addComplaint() {
    let userID = document.getElementById("userID").value.trim();
    let category = document.getElementById("category").value;
    let area = document.getElementById("area").value.trim();
    let city = document.getElementById("city").value.trim();
    let problem = document.getElementById("problem").value.trim();

    let users = JSON.parse(localStorage.getItem("users")) || [];
    let validUser = users.find(u => u.userID === userID);

    if (!validUser) {
        alert("Invalid User ID. Please login first.");
        return;
    }

    let complaints = getComplaints();
    let duplicate = findDuplicateComplaint(complaints, category, area, city, problem);

    if (duplicate) {
        let useExisting = confirm(
            `A similar complaint already exists in this location (${duplicate.complaintID}).\n` +
            "Press OK to support the existing complaint instead of creating a duplicate.\n" +
            "Press Cancel to submit as a new complaint."
        );

        if (useExisting) {
            let supported = supportExistingComplaintFromSubmission(duplicate, userID);
            saveComplaints(complaints);
            if (supported) {
                alert(`You supported existing complaint ${duplicate.complaintID}.`);
            } else {
                alert("Could not support the existing complaint.");
            }
            window.location.href = "publicTransparency.html";
            return;
        }
    }

    let cmpID = getComplaintId();
    complaints.push({
        complaintID: cmpID,
        userID: userID,
        category: category,
        area: area,
        city: city,
        problem: problem,
        priority: "Low",
        status: "Submitted",
        progressPercentage: 0,
        photo: "",
        submittedDate: new Date().toISOString(),
        resolvedDate: "",
        supportCount: 0,
        supportByUsers: [],
        comments: [],
        officialNotes: [],
        timeline: [
            createTimelineEvent("submitted", userID, "Complaint submitted")
        ]
    });

    saveComplaints(complaints);
    localStorage.setItem("lastComplaintID", cmpID);
    addNotification(userID, `Complaint ${cmpID} submitted successfully.`, cmpID, "submission");

    window.location.href = "problemsSuccess.html";
}

function displayComplaintId() {
    let cmpID = document.getElementById("cmpID");
    if (cmpID) {
        cmpID.innerText = localStorage.getItem("lastComplaintID");
    }
}

function displayUserId() {
    let uid = document.getElementById("uid");
    if (uid) {
        uid.innerText = localStorage.getItem("lastRegisteredUser");
    }
}

// ---------- UI Helpers ----------
function getStatusClass(status) {
    if (status === "Resolved") return "status-resolved";
    if (status === "In Progress") return "status-in-progress";
    return "status-pending";
}

function getPriorityClass(priority) {
    if (priority === "High") return "priority-high";
    if (priority === "Medium") return "priority-medium";
    return "priority-low";
}

function getProgressBarHtml(progressPercentage) {
    return `
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressPercentage}%"></div>
            </div>
            <div class="progress-text">${progressPercentage === 100 ? "RESOLVED" : progressPercentage + "%"}</div>
        </div>
    `;
}

function getLocationText(complaint) {
    return `${complaint.area}, ${complaint.city}`;
}

// ---------- Citizen Dashboard ----------
function displayCitizenComplaints() {
    let currentUser = getCurrentUser();
    if (!currentUser) {
        alert("Please login first!");
        window.location.href = "login.html";
        return;
    }

    let complaints = getComplaints();
    let tableBody = document.getElementById("citizenComplaintsTableBody");
    if (!tableBody) return;
    renderNotifications("citizenNotifications", currentUser.userID);

    tableBody.innerHTML = "";

    let userComplaints = complaints.filter(c => c.userID === currentUser.userID);

    if (userComplaints.length === 0) {
        let emptyRow = document.createElement("tr");
        emptyRow.innerHTML = `
            <td colspan="10" class="no-complaints">
                You have not submitted any complaints yet. <a href="problems.html">Submit your first complaint</a>.
            </td>
        `;
        tableBody.appendChild(emptyRow);
        return;
    }

    userComplaints.forEach((complaint) => {
        let row = document.createElement("tr");
        let progressPercentage = complaint.progressPercentage || 0;
        let progressBarHtml = getProgressBarHtml(progressPercentage);

        let evidenceHtml = complaint.photo
            ? `<img src="${complaint.photo}" class="evidence-photo" alt="Evidence" onclick="viewFullImage('${complaint.photo}')">`
            : '<span class="no-evidence">No evidence yet</span>';

        let submittedDate = formatDateTime(complaint.submittedDate);

        row.innerHTML = `
            <td class="complaint-id">${complaint.complaintID}</td>
            <td>${complaint.category}</td>
            <td>${getLocationText(complaint)}</td>
            <td class="problem-desc">${complaint.problem}</td>
            <td>${complaint.supportCount}</td>
            <td><span class="status-badge ${getStatusClass(complaint.status)}">${complaint.status}</span></td>
            <td>${progressBarHtml}</td>
            <td>${getResolutionDays(complaint)}</td>
            <td class="evidence-cell">${evidenceHtml}</td>
            <td class="submitted-date">${submittedDate}</td>
        `;

        tableBody.appendChild(row);
    });
}

// ---------- Government Dashboard ----------
function displayComplaintTable() {
    currentViewMode = "govt";

    if (!isGovtUser()) {
        alert("Access denied! Only government officials can access this page.");
        window.location.href = "home.html";
        return;
    }

    let complaints = getComplaints();

    updateStatistics(complaints);
    displayActivityLog();
    renderAdvancedAnalytics(complaints);
    renderAreaAnalytics(complaints, "areaAnalyticsChart", "heatmapStats");
    renderTopContributors(complaints, "topContributorsTableBody");

    let filteredComplaints = applyFiltersAndSearch(complaints);
    if (sortByPriorityFlag) {
        filteredComplaints = sortComplaintsByPriority(filteredComplaints);
    }

    let tableBody = document.getElementById("complaintsTableBody");
    if (!tableBody) return;

    tableBody.innerHTML = "";

    if (filteredComplaints.length === 0) {
        let emptyMessage = currentSearch
            ? "No complaints found matching your search."
            : "No complaints available yet. Citizens can submit complaints through the main portal.";

        let emptyRow = document.createElement("tr");
        emptyRow.innerHTML = `
            <td colspan="12" class="no-complaints">${emptyMessage}</td>
        `;
        tableBody.appendChild(emptyRow);
        return;
    }

    filteredComplaints.forEach((complaint) => {
        let row = document.createElement("tr");
        let progressPercentage = complaint.progressPercentage || 0;
        let progressBarHtml = getProgressBarHtml(progressPercentage);
        let actualIndex = complaints.findIndex(c => c.complaintID === complaint.complaintID);

        let evidenceHtml = complaint.photo
            ? `<img src="${complaint.photo}" class="evidence-photo" alt="Evidence" onclick="viewFullImage('${complaint.photo}')">`
            : '<span class="no-evidence">No evidence</span>';

        row.innerHTML = `
            <td class="complaint-id">${complaint.complaintID}</td>
            <td class="user-id">${complaint.userID}</td>
            <td>${complaint.category}</td>
            <td>${getLocationText(complaint)}</td>
            <td><span class="priority-badge ${getPriorityClass(complaint.priority)}">${complaint.priority || "Not set"}</span></td>
            <td class="problem-desc">${complaint.problem}</td>
            <td>${complaint.supportCount}</td>
            <td><span class="status-badge ${getStatusClass(complaint.status)}">${complaint.status}</span></td>
            <td>${progressBarHtml}</td>
            <td>${getResolutionDays(complaint)}</td>
            <td class="evidence-cell">${evidenceHtml}</td>
            <td class="actions-cell">
                <button class="btn btn-primary" onclick="startUpdate(${actualIndex})">Update Progress</button>
            </td>
        `;

        tableBody.appendChild(row);
    });
}

function displayActivityLog() {
    let tableBody = document.getElementById("activityLogTableBody");
    if (!tableBody) return;

    let logEntries = getActivityLog().slice().reverse();
    tableBody.innerHTML = "";

    if (logEntries.length === 0) {
        let row = document.createElement("tr");
        row.innerHTML = `<td colspan="4" class="no-complaints">No activity recorded yet.</td>`;
        tableBody.appendChild(row);
        return;
    }

    logEntries.forEach(entry => {
        let row = document.createElement("tr");
        row.innerHTML = `
            <td>${formatDateTime(entry.timestamp)}</td>
            <td>${entry.officialID}</td>
            <td>${entry.complaintID}</td>
            <td>${entry.action}</td>
        `;
        tableBody.appendChild(row);
    });
}

function exportComplaintsReport() {
    if (!isGovtUser()) {
        alert("Only government officials can export reports.");
        return;
    }

    let complaints = getComplaints();
    if (complaints.length === 0) {
        alert("No complaint data available to export.");
        return;
    }

    // CSV export for use in Excel/Sheets.
    let headers = [
        "Complaint ID", "User ID", "Category", "Area", "City", "Problem", "Priority",
        "Status", "Progress %", "Support Count", "Submitted Date", "Resolved Date", "Resolution Days"
    ];

    let csvRows = [headers.join(",")];

    complaints.forEach(c => {
        let values = [
            c.complaintID,
            c.userID,
            c.category,
            c.area,
            c.city,
            c.problem,
            c.priority,
            c.status,
            c.progressPercentage,
            c.supportCount,
            c.submittedDate,
            c.resolvedDate || "",
            getResolutionDays(c)
        ].map(v => `"${String(v).replace(/"/g, '""')}"`);

        csvRows.push(values.join(","));
    });

    let csvContent = csvRows.join("\n");
    let blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    let url = URL.createObjectURL(blob);

    let link = document.createElement("a");
    link.href = url;
    link.download = `complaints_report_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

// ---------- Public Transparency ----------
function getSupportActionHtml(complaint) {
    if (complaint.status === "Resolved") {
        return "";
    }

    let currentUser = getCurrentUser();
    if (!currentUser) {
        return `
            <div class="support-box">
                <div class="support-meta">Supported by <strong>${complaint.supportCount}</strong> citizen(s)</div>
                <div class="support-meta">Login as a citizen to support this complaint.</div>
            </div>
        `;
    }

    if (currentUser.role === "govt") {
        return `
            <div class="support-box">
                <div class="support-meta">Supported by <strong>${complaint.supportCount}</strong> citizen(s)</div>
                <div class="support-meta">Government users cannot support complaints.</div>
            </div>
        `;
    }

    return `
        <div class="support-box action-card">
            <div class="action-title">Support</div>
            <div class="support-meta">Supported by <strong>${complaint.supportCount}</strong> citizen(s)</div>
            <button class="btn btn-success" onclick="supportComplaint('${complaint.complaintID}')">Support this Complaint</button>
        </div>
    `;
}

function getTimelinePreviewHtml(complaint) {
    let events = (complaint.timeline || []).slice().reverse().slice(0, 4);
    if (events.length === 0) return "";

    let list = events.map(e => `<li><strong>${e.userID}</strong>: ${e.message} <span class="muted-small">(${formatDateTime(e.timestamp)})</span></li>`).join("");
    return `
        <div class="timeline-box">
            <div class="support-meta"><strong>Recent Timeline</strong></div>
            <ul class="mini-list">${list}</ul>
        </div>
    `;
}

function getCommentSectionHtml(complaint) {
    if (complaint.status === "Resolved") {
        return "";
    }

    let comments = (complaint.comments || []).slice().reverse().slice(0, 3);
    let commentsHtml = comments.length === 0
        ? `<div class="support-meta">No comments yet.</div>`
        : comments.map(c =>
            `<div class="comment-item ${c.role === "govt" ? "official-comment" : ""}">
                <strong>${c.userID}</strong>: ${c.text}
                <div class="muted-small">${formatDateTime(c.timestamp)}</div>
            </div>`
        ).join("");

    let currentUser = getCurrentUser();
    if (!currentUser) {
        return `
            <div class="comment-box action-card">
                <div class="action-title">Discussion</div>
                ${commentsHtml}
                <div class="support-meta">Login to add a comment or official reply.</div>
            </div>
        `;
    }

    let inputId = `commentInput_${complaint.complaintID.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    let buttonText = currentUser.role === "govt" ? "Post Official Reply" : "Post Comment";
    return `
        <div class="comment-box action-card">
            <div class="action-title">Discussion</div>
            ${commentsHtml}
            <textarea id="${inputId}" class="comment-input" rows="2" placeholder="Write your comment..."></textarea>
            <button class="btn btn-secondary" onclick="addComplaintComment('${complaint.complaintID}', '${inputId}')">${buttonText}</button>
        </div>
    `;
}

function addComplaintComment(complaintID, inputId) {
    let currentUser = getCurrentUser();
    if (!currentUser) {
        alert("Please login to comment.");
        return;
    }

    let input = document.getElementById(inputId);
    if (!input) return;

    let text = input.value.trim();
    if (!text) {
        alert("Please enter a comment.");
        return;
    }

    let complaints = getComplaints();
    let complaint = complaints.find(c => c.complaintID === complaintID);
    if (!complaint) {
        alert("Complaint not found.");
        return;
    }

    let roleTag = currentUser.role === "govt" ? "govt" : "citizen";
    let entry = {
        userID: currentUser.userID,
        role: roleTag,
        text: text,
        timestamp: new Date().toISOString()
    };

    complaint.comments.push(entry);
    complaint.timeline.push(
        createTimelineEvent(
            roleTag === "govt" ? "official-reply" : "comment",
            currentUser.userID,
            roleTag === "govt" ? "Official reply posted" : "Citizen comment added"
        )
    );

    if (roleTag === "govt") {
        addNotification(complaint.userID, `Official reply added on complaint ${complaint.complaintID}.`, complaint.complaintID, "official-reply");
    }

    saveComplaints(complaints);
    displayPublicComplaintTable();
}

function supportComplaint(complaintID) {
    let currentUser = getCurrentUser();
    if (!currentUser) {
        alert("Please login as a citizen to support this complaint.");
        return;
    }

    if (currentUser.role === "govt") {
        alert("Government User IDs cannot be used to support complaints.");
        return;
    }

    let enteredUserID = String(currentUser.userID).toUpperCase();

    let complaints = getComplaints();
    let complaint = complaints.find(c => c.complaintID === complaintID);

    if (!complaint) {
        alert("Complaint not found.");
        return;
    }

    if (complaint.status === "Resolved") {
        alert("This complaint is already resolved and can no longer receive support.");
        return;
    }

    if (complaint.supportByUsers.includes(enteredUserID)) {
        alert("This User ID has already supported this complaint.");
        return;
    }

    complaint.supportByUsers.push(enteredUserID);
    complaint.supportByUsers = [...new Set(complaint.supportByUsers)];
    complaint.supportCount = complaint.supportByUsers.length;
    complaint.timeline.push(createTimelineEvent("support", enteredUserID, `Complaint supported by ${enteredUserID}`));
    addNotification(complaint.userID, `${enteredUserID} supported complaint ${complaint.complaintID}.`, complaint.complaintID, "support");

    saveComplaints(complaints);
    displayPublicComplaintTable();
}

function displayPublicComplaintTable() {
    currentViewMode = "public";
    sortByPriorityFlag = false;

    let complaints = getComplaints();
    let filteredComplaints = applyFiltersAndSearch(complaints);

    let tableBody = document.getElementById("publicComplaintsTableBody");
    if (!tableBody) return;

    tableBody.innerHTML = "";

    if (filteredComplaints.length === 0) {
        let emptyMessage = currentSearch
            ? "No complaints found for that Complaint ID."
            : "No complaints have been submitted yet.";

        let emptyRow = document.createElement("tr");
        emptyRow.innerHTML = `
            <td colspan="11" class="no-complaints">${emptyMessage}</td>
        `;
        tableBody.appendChild(emptyRow);
        renderAreaAnalytics(complaints, "publicAreaAnalyticsChart", "publicHeatmapStats");
        renderTopContributors(complaints, "publicTopContributorsTableBody");
        return;
    }

    filteredComplaints.forEach((complaint) => {
        let row = document.createElement("tr");
        let progressPercentage = complaint.progressPercentage || 0;
        let progressBarHtml = getProgressBarHtml(progressPercentage);

        row.innerHTML = `
            <td class="complaint-id">${complaint.complaintID}</td>
            <td class="user-id">${complaint.userID}</td>
            <td>${complaint.category}</td>
            <td>${getLocationText(complaint)}</td>
            <td class="problem-desc">${complaint.problem}</td>
            <td><span class="priority-badge ${getPriorityClass(complaint.priority)}">${complaint.priority || "Low"}</span></td>
            <td>${complaint.supportCount}</td>
            <td><span class="status-badge ${getStatusClass(complaint.status)}">${complaint.status}</span></td>
            <td>${progressBarHtml}</td>
            <td>${getResolutionDays(complaint)}</td>
            <td class="actions-cell">
                <div class="action-stack">
                    ${getSupportActionHtml(complaint)}
                    ${getCommentSectionHtml(complaint)}
                    ${getTimelinePreviewHtml(complaint)}
                </div>
            </td>
        `;

        tableBody.appendChild(row);
    });

    renderAreaAnalytics(complaints, "publicAreaAnalyticsChart", "publicHeatmapStats");
    renderTopContributors(complaints, "publicTopContributorsTableBody");
}

// ---------- Update Workflow ----------
function startUpdate(index) {
    if (!isGovtUser()) {
        alert("Access denied! Only government officials can update complaints.");
        window.location.href = "home.html";
        return;
    }

    localStorage.setItem("selectedComplaintIndex", index);
    window.location.href = "update.html";
}

function loadUpdateForm() {
    try {
        if (!isGovtUser()) {
            alert("Access denied! Only government officials can access this page.");
            window.location.href = "home.html";
            return;
        }

        let index = parseInt(localStorage.getItem("selectedComplaintIndex"), 10);
        if (index === null || isNaN(index)) {
            alert("No complaint selected for update!");
            window.location.href = "govtDashboard.html";
            return;
        }

        let complaints = getComplaints();
        let complaint = complaints[index];

        if (!complaint) {
            alert("Complaint not found!");
            window.location.href = "govtDashboard.html";
            return;
        }

        document.getElementById("updateComplaintID").innerText = complaint.complaintID;
        document.getElementById("updateProblem").innerText = complaint.problem;
        document.getElementById("updateStatus").value = "Auto";
        document.getElementById("updatePriority").value = complaint.priority || "Low";
        document.getElementById("updateProgress").value = complaint.progressPercentage || 0;
        let noteInput = document.getElementById("updateOfficialNote");
        if (noteInput) {
            noteInput.value = "";
        }

        updateProgressDisplay();

        document.getElementById("updatePhoto").value = "";
        document.getElementById("photoPreviewContainer").style.display = "none";

        selectedComplaintIndex = index;
    } catch (error) {
        console.error("Error loading update form:", error);
        alert("An error occurred while loading the update form.");
        window.location.href = "govtDashboard.html";
    }
}

function updateProgressDisplay() {
    let progress = document.getElementById("updateProgress").value;
    document.getElementById("progressFill").style.width = progress + "%";
    document.getElementById("progressText").innerText = progress + "% Complete";
}

function previewPhoto() {
    let fileInput = document.getElementById("updatePhoto");
    let previewContainer = document.getElementById("photoPreviewContainer");

    if (fileInput.files.length > 0) {
        let file = fileInput.files[0];

        if (!file.type.startsWith("image/")) {
            alert("Please select a valid image file.");
            fileInput.value = "";
            previewContainer.style.display = "none";
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert("File size must be less than 5MB.");
            fileInput.value = "";
            previewContainer.style.display = "none";
            return;
        }

        let reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById("photoPreview").src = e.target.result;
            previewContainer.style.display = "block";
        };
        reader.readAsDataURL(file);
    } else {
        previewContainer.style.display = "none";
    }
}

function saveComplaintUpdate() {
    try {
        if (!isGovtUser()) {
            alert("Access denied! Only government officials can update complaints.");
            window.location.href = "home.html";
            return;
        }

        if (selectedComplaintIndex === -1) {
            alert("No complaint selected for update!");
            return;
        }

        let complaints = getComplaints();
        let complaint = complaints[selectedComplaintIndex];

        if (!complaint) {
            alert("Complaint not found!");
            return;
        }

        let progressPercentage = parseInt(document.getElementById("updateProgress").value, 10);
        let selectedStatus = document.getElementById("updateStatus").value;
        let officialNote = (document.getElementById("updateOfficialNote") || { value: "" }).value.trim();
        let photo = "";

        let fileInput = document.getElementById("updatePhoto");
        if (fileInput.files.length > 0) {
            let file = fileInput.files[0];
            let reader = new FileReader();
            reader.onload = function (e) {
                photo = e.target.result;
                updateComplaintData(complaint, progressPercentage, photo, complaints, selectedStatus, officialNote);
            };
            reader.readAsDataURL(file);
        } else {
            updateComplaintData(complaint, progressPercentage, photo, complaints, selectedStatus, officialNote);
        }
    } catch (error) {
        console.error("Error in saveComplaintUpdate:", error);
        alert("An error occurred while saving the update.");
    }
}

function updateComplaintData(complaint, progressPercentage, photo, complaints, selectedStatus, officialNote) {
    let oldStatus = complaint.status;
    let oldProgress = complaint.progressPercentage || 0;

    complaint.progressPercentage = progressPercentage;

    if (selectedStatus === "Auto" || !selectedStatus) {
        if (progressPercentage === 0) {
            complaint.status = "Submitted";
        } else if (progressPercentage === 100) {
            complaint.status = "Resolved";
        } else {
            complaint.status = "In Progress";
        }
    } else {
        complaint.status = selectedStatus;
    }

    let newPriority = document.getElementById("updatePriority").value;
    complaint.priority = newPriority;

    if (photo) {
        complaint.photo = photo;
        complaint.timeline.push(createTimelineEvent("evidence", getCurrentUser()?.userID, "New evidence uploaded"));
        notifyComplaintStakeholders(complaint, `New evidence uploaded for complaint ${complaint.complaintID}.`, "evidence");
    }

    if (complaint.status === "Resolved") {
        // Stamp resolved date only when it becomes resolved.
        if (!complaint.resolvedDate) {
            complaint.resolvedDate = new Date().toISOString();
        }
    } else {
        complaint.resolvedDate = "";
    }

    if (oldProgress !== complaint.progressPercentage) {
        complaint.timeline.push(
            createTimelineEvent(
                "progress",
                getCurrentUser()?.userID,
                `Progress updated from ${oldProgress}% to ${complaint.progressPercentage}%`
            )
        );
        notifyComplaintStakeholders(complaint, `Progress updated to ${complaint.progressPercentage}% for ${complaint.complaintID}.`, "progress");
    }

    if (oldStatus !== complaint.status) {
        complaint.timeline.push(
            createTimelineEvent(
                "status",
                getCurrentUser()?.userID,
                `Status changed from ${oldStatus} to ${complaint.status}`
            )
        );
        notifyComplaintStakeholders(complaint, `Status changed to ${complaint.status} for complaint ${complaint.complaintID}.`, "status");
    }

    if (officialNote) {
        complaint.officialNotes.push({
            userID: getCurrentUser()?.userID || "GOVT",
            text: officialNote,
            timestamp: new Date().toISOString()
        });
        complaint.comments.push({
            userID: getCurrentUser()?.userID || "GOVT",
            role: "govt",
            text: officialNote,
            timestamp: new Date().toISOString()
        });
        complaint.timeline.push(createTimelineEvent("official-note", getCurrentUser()?.userID, "Official note added"));
        notifyComplaintStakeholders(complaint, `Government note added for complaint ${complaint.complaintID}.`, "official-note");
    }

    addGovtActivity(
        complaint.complaintID,
        `Progress set to ${complaint.progressPercentage}% | Status: ${complaint.status} | Priority: ${complaint.priority}`
    );

    if (oldStatus !== "Resolved" && complaint.status === "Resolved") {
        addGovtActivity(complaint.complaintID, "Complaint marked as resolved");
        complaint.timeline.push(createTimelineEvent("resolved", getCurrentUser()?.userID, "Complaint marked as resolved"));
        notifyComplaintStakeholders(complaint, `Complaint ${complaint.complaintID} has been resolved.`, "resolved");
    }

    saveComplaints(complaints);

    alert("Complaint updated successfully!");
    window.location.href = "govtDashboard.html";
}

function cancelUpdate() {
    localStorage.removeItem("selectedComplaintIndex");
    window.location.href = "govtDashboard.html";
}

function renderNotifications(containerId, userID) {
    let container = document.getElementById(containerId);
    if (!container || !userID) return;

    let notifications = getUserNotifications(userID);
    if (notifications.length === 0) {
        container.innerHTML = '<div class="no-data">No notifications yet.</div>';
        return;
    }

    container.innerHTML = notifications
        .slice(0, 12)
        .map(n => `
            <div class="notification-item ${n.read ? "" : "unread"}">
                <div>${n.message}</div>
                <div class="muted-small">${formatDateTime(n.timestamp)}</div>
            </div>
        `)
        .join("");

    markAllNotificationsRead(userID);
}

function getContributionScores(complaints) {
    let scores = {};
    complaints.forEach(c => {
        if (!scores[c.userID]) {
            scores[c.userID] = { submitted: 0, supported: 0 };
        }
        scores[c.userID].submitted += 1;

        (c.supportByUsers || []).forEach(uid => {
            if (!scores[uid]) {
                scores[uid] = { submitted: 0, supported: 0 };
            }
            scores[uid].supported += 1;
        });
    });

    return Object.keys(scores).map(userID => ({
        userID,
        submitted: scores[userID].submitted,
        supported: scores[userID].supported,
        score: scores[userID].submitted * 2 + scores[userID].supported
    }))
        .sort((a, b) => b.score - a.score);
}

function renderTopContributors(complaints, tableBodyId) {
    let tableBody = document.getElementById(tableBodyId);
    if (!tableBody) return;

    let contributors = getContributionScores(complaints).slice(0, 8);
    if (contributors.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="no-complaints">No contributor data available.</td></tr>';
        return;
    }

    tableBody.innerHTML = contributors.map(c => `
        <tr>
            <td class="user-id">${c.userID}</td>
            <td>${c.submitted}</td>
            <td>${c.supported}</td>
            <td><strong>${c.score}</strong></td>
        </tr>
    `).join("");
}

function renderAreaAnalytics(complaints, chartContainerId, heatmapContainerId) {
    let chartContainer = document.getElementById(chartContainerId);
    let heatmapContainer = document.getElementById(heatmapContainerId);
    if (!chartContainer && !heatmapContainer) return;

    let areaCount = {};
    complaints.forEach(c => {
        let key = `${c.area}, ${c.city}`;
        areaCount[key] = (areaCount[key] || 0) + 1;
    });

    let entries = Object.entries(areaCount).sort((a, b) => b[1] - a[1]);
    let top = entries.slice(0, 8);

    if (chartContainer) {
        if (top.length === 0) {
            chartContainer.innerHTML = '<div class="no-data">No area analytics available yet.</div>';
        } else {
            let max = top[0][1];
            chartContainer.innerHTML = top.map(([area, count]) => `
                <div class="bar-row">
                    <div class="bar-label">${area}</div>
                    <div class="bar-wrap"><div class="bar-fill" style="width:${Math.max(8, (count / max) * 100)}%"></div></div>
                    <div class="bar-value">${count}</div>
                </div>
            `).join("");
        }
    }

    if (heatmapContainer) {
        if (top.length === 0) {
            heatmapContainer.innerHTML = '<div class="no-data">No heatmap data available yet.</div>';
        } else {
            let max = top[0][1];
            heatmapContainer.innerHTML = top.map(([area, count]) => {
                let intensity = Math.max(0.18, count / max);
                return `<div class="heat-cell" style="background: rgba(23,105,170,${intensity.toFixed(2)});">${area}<span>${count} complaints</span></div>`;
            }).join("");
        }
    }
}

function renderAdvancedAnalytics(complaints) {
    let avgResolutionEl = document.getElementById("avgResolutionTime");
    let commonCategoryEl = document.getElementById("mostCommonCategory");
    let mostSupportedEl = document.getElementById("mostSupportedComplaint");
    let trendEl = document.getElementById("complaintTrend");
    let categoryChartEl = document.getElementById("categoryTrendChart");

    if (!avgResolutionEl || !commonCategoryEl || !mostSupportedEl || !trendEl || !categoryChartEl) {
        return;
    }

    let resolved = complaints.filter(c => c.status === "Resolved" && c.submittedDate && c.resolvedDate);
    let avgDays = "-";
    if (resolved.length > 0) {
        let totalDays = resolved.reduce((sum, c) => {
            let d = Math.max(0, Math.ceil((new Date(c.resolvedDate) - new Date(c.submittedDate)) / (1000 * 60 * 60 * 24)));
            return sum + d;
        }, 0);
        avgDays = `${(totalDays / resolved.length).toFixed(1)} days`;
    }

    let categoryCount = {};
    complaints.forEach(c => {
        categoryCount[c.category] = (categoryCount[c.category] || 0) + 1;
    });
    let commonCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];

    let mostSupported = complaints.slice().sort((a, b) => (b.supportCount || 0) - (a.supportCount || 0))[0];

    let now = new Date();
    let sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);
    let trendCount = complaints.filter(c => new Date(c.submittedDate) >= sevenDaysAgo).length;

    avgResolutionEl.textContent = avgDays;
    commonCategoryEl.textContent = commonCategory ? `${commonCategory[0]} (${commonCategory[1]})` : "-";
    mostSupportedEl.textContent = mostSupported ? `${mostSupported.complaintID} (${mostSupported.supportCount || 0})` : "-";
    trendEl.textContent = `${trendCount} new complaints`;

    let sortedCategories = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (sortedCategories.length === 0) {
        categoryChartEl.innerHTML = '<div class="no-data">No category trend data available.</div>';
        return;
    }

    let max = sortedCategories[0][1];
    categoryChartEl.innerHTML = sortedCategories.map(([name, value]) => `
        <div class="bar-row">
            <div class="bar-label">${name}</div>
            <div class="bar-wrap"><div class="bar-fill alt" style="width:${Math.max(8, (value / max) * 100)}%"></div></div>
            <div class="bar-value">${value}</div>
        </div>
    `).join("");
}

function initializeTheme() {
    let savedTheme = localStorage.getItem(THEME_KEY) || "light";
    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
    } else {
        document.body.classList.remove("dark-mode");
    }
}

function toggleTheme() {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem(THEME_KEY, document.body.classList.contains("dark-mode") ? "dark" : "light");
}

function attachThemeToggle() {
    let existing = document.getElementById("themeToggleBtn");
    if (existing) return;

    let btn = document.createElement("button");
    btn.id = "themeToggleBtn";
    btn.className = "btn btn-secondary theme-toggle";
    btn.type = "button";
    btn.textContent = "Toggle Dark Mode";
    btn.onclick = toggleTheme;
    document.body.appendChild(btn);
}

// ---------- Shared Utilities ----------
function viewFullImage(imageSrc) {
    let modal = document.createElement("div");
    modal.className = "image-modal";
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close-modal" onclick="closeImageModal()">&times;</span>
            <img src="${imageSrc}" class="full-image" alt="Evidence Photo">
        </div>
    `;

    document.body.appendChild(modal);

    modal.onclick = function (event) {
        if (event.target === modal) {
            closeImageModal();
        }
    };
}

function closeImageModal() {
    let modal = document.querySelector(".image-modal");
    if (modal) {
        modal.remove();
    }
}

function logout() {
    localStorage.removeItem("currentUser");
    alert("Logged out successfully!");
    window.location.href = "home.html";
}

function clearAllData() {
    if (confirm("Are you sure you want to delete all stored data? This action cannot be undone.")) {
        localStorage.clear();
        alert("All data has been cleared.");
        location.reload();
    }
}

function updateStatistics(complaints) {
    let totalEl = document.getElementById("totalComplaints");
    let submittedEl = document.getElementById("submittedComplaints");
    let progressEl = document.getElementById("inProgressComplaints");
    let resolvedEl = document.getElementById("resolvedComplaints");

    if (!totalEl || !submittedEl || !progressEl || !resolvedEl) {
        return;
    }

    let total = complaints.length;
    let submitted = complaints.filter(c => c.status === "Submitted").length;
    let inProgress = complaints.filter(c => c.status === "In Progress").length;
    let resolved = complaints.filter(c => c.status === "Resolved").length;

    totalEl.textContent = total;
    submittedEl.textContent = submitted;
    progressEl.textContent = inProgress;
    resolvedEl.textContent = resolved;
}

function applyFiltersAndSearch(complaints) {
    let filtered = [...complaints];

    if (currentFilter === "High Priority") {
        filtered = filtered.filter(c => c.priority === "High");
    } else if (currentFilter !== "all") {
        filtered = filtered.filter(c => c.status === currentFilter);
    }

    if (currentSearch) {
        filtered = filtered.filter(c =>
            c.complaintID.toLowerCase().includes(currentSearch.toLowerCase())
        );
    }

    return filtered;
}

function setFilter(filterType, clickedElement) {
    currentFilter = filterType;

    document.querySelectorAll(".btn-filter").forEach(btn => {
        btn.classList.remove("active");
    });

    if (clickedElement) {
        clickedElement.classList.add("active");
    }

    if (currentViewMode === "public") {
        displayPublicComplaintTable();
    } else {
        displayComplaintTable();
    }
}

function filterComplaints() {
    let searchInput = document.getElementById("searchInput");
    currentSearch = searchInput ? searchInput.value.trim() : "";

    if (currentViewMode === "public") {
        displayPublicComplaintTable();
    } else {
        displayComplaintTable();
    }
}

function sortComplaintsByPriority(complaints) {
    const priorityOrder = { High: 3, Medium: 2, Low: 1 };

    return complaints.sort((a, b) => {
        let priorityA = priorityOrder[a.priority] || 0;
        let priorityB = priorityOrder[b.priority] || 0;
        return priorityB - priorityA;
    });
}

function sortByPriority() {
    if (currentViewMode !== "govt") return;

    sortByPriorityFlag = !sortByPriorityFlag;
    let sortBtn = document.querySelector(".btn-sort");
    if (sortBtn) {
        sortBtn.textContent = sortByPriorityFlag ? "Priority Sorted" : "Sort by Priority";
    }

    displayComplaintTable();
}

// ---------- Complaint Tracking ----------
function trackComplaint() {
    let complaintID = document.getElementById("trackComplaintID").value.trim().toUpperCase();
    let userID = document.getElementById("trackUserID").value.trim().toUpperCase();

    if (!complaintID || !userID) {
        alert("Please enter both Complaint ID and User ID.");
        return;
    }

    let complaints = getComplaints();
    let complaint = complaints.find(c => c.complaintID === complaintID && c.userID === userID);

    if (!complaint) {
        alert("Complaint not found or you do not have permission to view this complaint. Please check your IDs and try again.");
        document.getElementById("complaintDetails").style.display = "none";
        return;
    }

    document.getElementById("detailComplaintID").textContent = complaint.complaintID;
    document.getElementById("detailCategory").textContent = complaint.category;
    document.getElementById("detailLocation").textContent = getLocationText(complaint);
    document.getElementById("detailProblem").textContent = complaint.problem;
    document.getElementById("detailPriority").textContent = complaint.priority || "Not set";
    document.getElementById("detailSupportCount").textContent = complaint.supportCount;
    document.getElementById("detailStatus").textContent = complaint.status;
    document.getElementById("detailResolutionTime").textContent = getResolutionDays(complaint);

    let progressPercentage = complaint.progressPercentage || 0;
    document.getElementById("detailProgressFill").style.width = progressPercentage + "%";
    document.getElementById("detailProgressText").textContent = progressPercentage === 100 ? "RESOLVED" : progressPercentage + "%";

    let evidenceElement = document.getElementById("detailEvidence");
    if (complaint.photo) {
        evidenceElement.innerHTML = `<img src="${complaint.photo}" class="evidence-photo" alt="Evidence" onclick="viewFullImage('${complaint.photo}')">`;
    } else {
        evidenceElement.textContent = "No evidence uploaded yet.";
    }

    let timelineEl = document.getElementById("detailTimeline");
    if (timelineEl) {
        timelineEl.innerHTML = getTimelinePreviewHtml(complaint) || '<div class="support-meta">No timeline entries yet.</div>';
    }

    let commentsEl = document.getElementById("detailComments");
    if (commentsEl) {
        let comments = complaint.comments || [];
        if (comments.length === 0) {
            commentsEl.innerHTML = '<div class="support-meta">No discussion yet.</div>';
        } else {
            commentsEl.innerHTML = comments
                .slice()
                .reverse()
                .map(c => `<div class="comment-item ${c.role === "govt" ? "official-comment" : ""}"><strong>${c.userID}</strong>: ${c.text}<div class="muted-small">${formatDateTime(c.timestamp)}</div></div>`)
                .join("");
        }
    }

    document.getElementById("complaintDetails").style.display = "block";
}
