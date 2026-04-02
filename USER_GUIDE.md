# Mallakhamb Competition Management System - User Guide

**Welcome!** This guide will help you understand and use the Mallakhamb Competition Management System, even if you're not familiar with technical terms.

---

## What is This System?

The Mallakhamb Competition Management System is a web application that helps organize and manage Mallakhamb sports competitions. Think of it as a digital platform where:

- **Competitions** can be created and managed
- **Teams** can register and participate
- **Players** can join teams
- **Judges** can score performances in real-time
- **Results** are calculated automatically and displayed publicly

---

## Who Can Use This System?

The system has 5 different types of users, each with specific roles:

### 1. **Super Admin** (System Manager)
- **What they do:** Manage the entire system
- **Key responsibilities:**
  - Create new competitions
  - Assign administrators to competitions
  - View overall system statistics
  - Manage all users

### 2. **Admin** (Competition Manager)
- **What they do:** Manage specific competitions
- **Key responsibilities:**
  - Set up judges for competitions
  - Start competitions
  - View and manage team registrations
  - Save and publish scores
  - Generate rankings

### 3. **Coach** (Team Manager)
- **What they do:** Manage their team
- **Key responsibilities:**
  - Create a team
  - Register team for competitions
  - Add players to the team
  - Submit team for competition (with payment)
  - View team dashboard

### 4. **Player** (Participant)
- **What they do:** Participate in competitions
- **Key responsibilities:**
  - Register an account
  - Join a team
  - View their team information
  - Check competition details

### 5. **Judge** (Scorer)
- **What they do:** Score player performances
- **Key responsibilities:**
  - Login to assigned competition
  - Score players during competition
  - View teams they need to judge

---

## How to Access the System

### Website Address
The system is accessed through a web browser at:
- **Production:** `https://mallakhamb-web.onrender.com`
- **Local Development:** `http://localhost:5173`

### Login Pages
Each user type has their own login page:
- **Player:** `https://mallakhamb-web.onrender.com/player/login`
- **Coach:** `https://mallakhamb-web.onrender.com/coach/login`
- **Admin:** `https://mallakhamb-web.onrender.com/admin/login`
- **Judge:** `https://mallakhamb-web.onrender.com/judge/login`
- **Super Admin:** `https://mallakhamb-web.onrender.com/superadmin/login`

---

## Step-by-Step Workflows

### For Players

#### Step 1: Register Your Account
1. Go to `/player/register`
2. Fill in your details:
   - First Name and Last Name
   - Email address
   - Date of Birth (used to determine your age group)
   - Gender (Male/Female)
   - Password (minimum 12 characters)
3. Click "Register"
4. You'll be logged in automatically

#### Step 2: Join a Team
1. After registration, you'll see available teams
2. Browse teams that are registered for competitions
3. Click "Join Team" on your preferred team
4. You're now part of the team!

#### Step 3: View Your Dashboard
1. Go to `/player/dashboard`
2. See your team information
3. View competition details
4. Check your profile

---

### For Coaches

#### Step 1: Register and Create Team
1. Go to `/coach/register`
2. Fill in your details (name, email, password)
3. After registration, create your team:
   - Team name
   - Team description
4. One coach can manage one team

#### Step 2: Register for Competition
1. View available competitions
2. Select a competition to participate in
3. Register your team for that competition

#### Step 3: Add Players to Your Team
1. Go to your dashboard
2. Search for registered players
3. Add players to specific age groups:
   - **Boys:** Under 10, Under 12, Under 14, Under 18, Above 18
   - **Girls:** Under 10, Under 12, Under 14, Under 16, Above 16
4. The system automatically checks if the player's age matches the group

#### Step 4: Submit Your Team
1. Review your team roster
2. Click "Submit Team"
3. Payment is calculated:
   - Base fee: ₹500
   - Per player: ₹100
   - Example: 10 players = ₹500 + (10 × ₹100) = ₹1,500
4. After submission, your team is visible to admins and judges

---

### For Judges

#### Step 1: Login
1. Go to `/judge/login`
2. Enter your username and password (provided by admin)
3. You'll be automatically assigned to your competition

#### Step 2: View Teams
1. See teams assigned to you based on:
   - Gender (Male/Female)
   - Age Group (U10, U12, U14, etc.)
   - Competition Type (Type I, II, or III)

#### Step 3: Score Players
1. Select a team to score
2. Enter scores for each player (0-10 scale)
3. Scores are updated in real-time
4. Other judges and admins see your scores immediately

**Judge Types:**
- **Senior Judge:** Provides base score (difficulty, combination, originality)
- **Judge 1-4:** Provide execution scores (these are averaged)

---

### For Admins

#### Step 1: Login and Select Competition
1. Go to `/admin/login`
2. Enter your credentials
3. Select which competition you want to manage

#### Step 2: View Dashboard
1. See statistics:
   - Total teams registered
   - Total players
   - Number of judges assigned
2. View submitted teams by gender and age group

#### Step 3: Create Judges
1. For each gender + age group + competition type, create judges:
   - Minimum 3 judges required (1 Senior + 2 Judges)
   - Maximum 5 judges allowed (1 Senior + 4 Judges)
2. Provide for each judge:
   - Name
   - Username (for login)
   - Password
   - Judge type (Senior Judge, Judge 1, Judge 2, etc.)

#### Step 4: Start Competition
1. Once judges are assigned, start the age group competition
2. After starting, judge assignments cannot be changed
3. Judges can now begin scoring

#### Step 5: Manage Scores
1. View live scores as judges enter them
2. Save complete team scores
3. Lock scores to prevent further changes
4. Generate rankings:
   - **Individual Rankings:** All players ranked by score
   - **Team Rankings:** Top 5 players per team, ranked by total score

---

### For Super Admins

#### Step 1: Create Competition
1. Go to `/superadmin/dashboard`
2. Click "Create Competition"
3. Fill in details:
   - Competition name
   - Level (District/State/National/International)
   - Location
   - Start and end dates
   - Age groups to include
   - Competition types (Type I, II, III)

#### Step 2: Assign Admins
1. Select a competition
2. Assign one or more admins to manage it
3. Admins must re-login to access the competition

#### Step 3: Monitor System
1. View system-wide statistics
2. Manage all users (admins, coaches, players)
3. View all transactions
4. Delete or update competitions

---

## Understanding the Competition Flow

### Phase 1: Setup (Before Competition)
1. **Super Admin** creates competition
2. **Super Admin** assigns admins
3. **Coaches** register teams
4. **Players** join teams
5. **Coaches** add players to age groups
6. **Coaches** submit teams (payment)

### Phase 2: Pre-Competition
1. **Admin** reviews submitted teams
2. **Admin** creates judges for each category
3. **Admin** starts age group competitions

### Phase 3: Competition Day
1. **Judges** login and view their assigned teams
2. **Judges** score players in real-time
3. Scores are broadcast live to all viewers
4. System automatically calculates averages

### Phase 4: Results
1. **Admin** saves final scores
2. **Admin** locks scores
3. System generates individual and team rankings
4. Results are published publicly

---

## Key Features Explained

### Real-Time Scoring
- When a judge enters a score, everyone sees it immediately
- No need to refresh the page
- Helps coordinate between multiple judges
- Prevents duplicate scoring

### Automatic Calculations
The system automatically calculates:
- **Execution Average:** Average of Judge 1-4 scores
- **Final Score:** Base score + execution - deductions
- **Rankings:** Sorted by final score
- **Tie-Breaker:** If scores are equal, execution average decides the winner

### Team Rankings
- System selects top 5 players from each team
- Adds their scores together
- Ranks teams by total score
- Shows average score per player

### Age Groups
Players are automatically assigned to age groups based on their date of birth:

**Boys (Male):**
- **Under 10:** Under 10 years old
- **Under 12:** Under 12 years old
- **Under 14:** Under 14 years old
- **Under 18:** Under 18 years old
- **Above 18:** 18 years and above

**Girls (Female):**
- **Under 10:** Under 10 years old
- **Under 12:** Under 12 years old
- **Under 14:** Under 14 years old
- **Under 16:** Under 16 years old
- **Above 16:** 16 years and above

### Payment Tracking
- Base team fee: ₹500
- Per player fee: ₹100
- System calculates total automatically
- Tracks payment status (pending/completed/failed)

---

## Public Features (No Login Required)

Anyone can view:
- **Public Scores:** `/scores` - View all competition scores
- **Ongoing Competitions:** List of active competitions
- **Team Information:** See registered teams
- **Judge Assignments:** View who is judging which category

---

## Important Rules and Restrictions

### For Coaches
- One coach can create only ONE team
- Cannot modify team after submission
- Must have competition selected to add players
- Payment required before team becomes visible to judges

### For Players
- Can join one team per competition
- Age group is automatically calculated (cannot be changed)
- Cannot change team after joining

### For Judges
- Can only score assigned gender/age group
- Score range is 0-10
- Cannot modify scores after admin locks them
- Limited to assigned competition types

### For Admins
- Can only access assigned competitions
- Cannot modify judges after competition starts
- Must have minimum 3 judges to start age group
- Requires competition context for most operations

---

## Security Features

### Password Requirements
- Minimum 8 characters
- Must include:
  - Uppercase letters (A-Z)
  - Lowercase letters (a-z)
  - Numbers (0-9)
  - Special characters (!@#$%^&*)

### Account Protection
- After 5 failed login attempts, account is locked for 15 minutes
- Passwords are encrypted and never stored in plain text
- Sessions expire after 7 days
- Automatic logout on security events

### Data Protection
- All data is encrypted
- Secure connections (HTTPS)
- No sensitive information in URLs
- Protected against common web attacks

---

## Troubleshooting Common Issues

### Cannot Login
- **Check your credentials** - Verify email/username and password
- **Account locked?** - Wait 15 minutes after 5 failed attempts
- **Forgot password?** - Use "Forgot Password" link on login page

### Cannot See Competition
- **Not assigned?** - Contact super admin for access
- **Competition not selected?** - Select competition from dropdown
- **Need to re-login?** - Logout and login again to refresh

### Cannot Add Players
- **Competition not selected?** - Set competition context first
- **Team already submitted?** - Cannot modify after submission
- **Player doesn't exist?** - Player must register first
- **Age group mismatch?** - Player's age must match the group

### Scores Not Updating
- **Check internet connection** - Real-time features need stable connection
- **Refresh the page** - Sometimes helps reconnect
- **Wrong scoring room?** - Verify you're in correct gender/age group
- **Browser issues?** - Try a different browser

### Cannot Submit Team
- **Players added?** - Must have players in age groups
- **Payment info missing?** - Check payment details
- **Already submitted?** - Cannot submit twice
- **Contact admin** - For other issues

---

## Tips for Best Experience

### For All Users
1. **Use a modern browser** - Chrome, Firefox, Safari, or Edge
2. **Stable internet** - Required for real-time features
3. **Keep credentials safe** - Don't share passwords
4. **Logout when done** - Especially on shared computers

### For Coaches
1. **Register early** - Don't wait until the last minute
2. **Verify player info** - Check all details before submission
3. **Complete payment promptly** - Required for participation
4. **Communicate with players** - Keep them informed

### For Judges
1. **Test login before competition** - Ensure credentials work
2. **Stay connected** - Keep browser open during scoring
3. **Score consistently** - Use the full 0-10 range
4. **Report issues immediately** - Contact admin if problems occur

### For Admins
1. **Create judges early** - Before competition day
2. **Verify judge credentials** - Test logins work
3. **Monitor live scoring** - Watch for missing scores
4. **Lock scores after verification** - Prevents accidental changes

---

## Getting Help

### During Competition
- **Players/Coaches:** Contact your competition admin
- **Judges:** Contact competition admin immediately
- **Admins:** Contact super admin or technical support

### Technical Issues
- **Check this guide first** - Most common issues are covered
- **Try basic troubleshooting** - Refresh page, check internet, try different browser
- **Contact support** - Provide details about the issue

### Account Issues
- **Forgot password:** Use password reset feature
- **Account locked:** Wait 15 minutes or contact admin
- **Access denied:** Contact super admin for permissions

---

## Frequently Asked Questions

**Q: Can I change my age group?**  
A: No, age groups are automatically calculated from your date of birth and cannot be changed.

**Q: Can a coach manage multiple teams?**  
A: No, one coach can create and manage only one team.

**Q: What happens if I forget my password?**  
A: Use the "Forgot Password" link on the login page. You'll receive an email with reset instructions.

**Q: Can I join multiple teams?**  
A: You can join one team per competition, but can participate in multiple competitions.

**Q: How are scores calculated?**  
A: The system averages execution scores from Judge 1-4, applies the senior judge's base score, and subtracts deductions.

**Q: What if two players have the same score?**  
A: The system uses execution average as a tie-breaker. Higher execution average wins.

**Q: Can I edit my team after submission?**  
A: No, teams cannot be modified after submission. Plan carefully before submitting.

**Q: How do I know if my payment is successful?**  
A: Check your team dashboard for payment status (pending/completed/failed).

**Q: Can judges see each other's scores?**  
A: Yes, all judges in the same scoring room see scores in real-time.

**Q: What if the internet disconnects during scoring?**  
A: Reconnect as soon as possible. Scores entered before disconnection are saved.

---

## System Requirements

### Supported Browsers
- Google Chrome (recommended)
- Mozilla Firefox
- Safari
- Microsoft Edge

### Supported Devices
- Desktop computers
- Laptops
- Tablets
- Smartphones (responsive design)

### Internet Connection
- Stable internet required
- Minimum speed: 2 Mbps
- Real-time features need consistent connection

---

## Glossary of Terms

- **Age Group:** Category based on player's age (U10, U12, U14, etc.)
- **Competition Type:** Different types of competitions (Type I, II, III)
- **Dashboard:** Main page showing overview and statistics
- **Execution Score:** Score given by judges for performance execution
- **Base Score:** Score provided by senior judge for difficulty and originality
- **Real-time:** Updates happen instantly without refreshing
- **Submission:** Finalizing team roster and payment
- **Token:** Digital key that keeps you logged in
- **Transaction:** Payment record in the system

---

**Last Updated:** March 2026  
**Version:** 1.0.0  
**Status:** Production Ready

---

*This guide covers the essential features and workflows of the Mallakhamb Competition Management System. For technical details or advanced features, please contact your system administrator.*
