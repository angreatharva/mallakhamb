# Security Quick Start Guide
## Getting Your Server Running Securely

---

## 🚨 BEFORE YOU START THE SERVER

The server will now validate your environment variables on startup. If anything is missing or invalid, it will exit with an error message.

---

## ✅ STEP 1: Update Your .env File

Your `.env` file MUST have these variables:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/mallakhamb

# JWT Secret (MUST be at least 32 characters)
JWT_SECRET=your-super-secret-jwt-key-that-is-at-least-32-characters-long

# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Other variables...
PORT=5000
NODE_ENV=development
```

### ⚠️ IMPORTANT: JWT_SECRET

Your JWT_SECRET must be:
- At least 32 characters long
- Random and unpredictable
- Never committed to version control

**Generate a secure secret:**
```bash
# On Linux/Mac:
openssl rand -base64 32

# On Windows PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

---

## ✅ STEP 2: Start the Server

```bash
cd Server
npm install
npm start
```

If you see this message, you're good:
```
✅ Environment variables validated successfully
✅ Cleanup jobs started
```

If you see errors, fix your .env file and try again.

---

## 🔐 WHAT CHANGED?

### For Users (Registration/Login)

**New Password Requirements:**
- Minimum 8 characters
- Must contain uppercase letters (A-Z)
- Must contain lowercase letters (a-z)
- Must contain numbers (0-9)
- Must contain special characters (!@#$%^&*(),.?":{}|<>)

**Example valid password:** `MyPass123!`

**Example invalid passwords:**
- `password` - No uppercase, numbers, or special chars
- `PASSWORD123` - No lowercase or special chars
- `MyPassword` - No numbers or special chars
- `Pass1!` - Too short (less than 8 characters)

### For Developers

**Query Parameters:**
All query parameters are now sanitized to prevent NoSQL injection:
```javascript
// ❌ OLD (vulnerable)
const { gender } = req.query;
const teams = await Team.find({ gender });

// ✅ NEW (secure)
const { sanitizeQueryParam } = require('../utils/sanitization');
const gender = sanitizeQueryParam(req.query.gender);
const teams = await Team.find({ gender });
```

**Score Validation:**
All scores are validated to be between 0-10:
```javascript
const { validateScore } = require('../utils/scoreValidation');
try {
  const validatedScore = validateScore(score);
  // Use validatedScore
} catch (error) {
  return res.status(400).json({ message: error.message });
}
```

---

## 🐛 TROUBLESHOOTING

### Error: "FATAL: JWT_SECRET environment variable is not set"
**Solution:** Add JWT_SECRET to your .env file (at least 32 characters)

### Error: "FATAL: JWT_SECRET must be at least 32 characters"
**Solution:** Make your JWT_SECRET longer (use the generator command above)

### Error: "FATAL: Missing required environment variables"
**Solution:** Check the error message for which variables are missing and add them to .env

### Error: "Password does not meet requirements"
**Solution:** Use a stronger password that meets all requirements (see above)

### Error: "Score must be between 0 and 10"
**Solution:** Ensure score values are valid numbers between 0 and 10

---

## 📚 ADDITIONAL RESOURCES

- Full security audit: `SECURITY_AUDIT_PLAN.md`
- Applied fixes: `SECURITY_FIXES_APPLIED.md`
- Example .env: `.env_example`

---

## 🆘 NEED HELP?

If you encounter issues:
1. Check the server console for error messages
2. Verify your .env file has all required variables
3. Ensure JWT_SECRET is at least 32 characters
4. Check that MongoDB is running

---

**Last Updated:** 2026-03-11
