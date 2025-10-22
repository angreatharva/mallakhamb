# Sports Event Entry Web Application

A comprehensive sports event management system built with React, Node.js, and MongoDB. This application allows players to register and join teams, while coaches can manage teams and assign players to different age groups.

## 🚀 Features

### For Players
- **Registration & Login**: Secure registration with Aadhar number validation
- **Team Selection**: Join existing teams or get assigned by coaches
- **Profile Management**: View personal information and team details
- **Age Group Assignment**: Automatic age group categorization

### For Coaches
- **Team Management**: Create and manage teams
- **Player Assignment**: Add players to specific age groups
- **Age Group Organization**: 
  - Boys: Under 10, 12, 14, 16, 18, and Above 18
  - Girls: Under 10, 12, 14, 16, and Above 16
- **Dashboard**: Comprehensive team overview and statistics

## 🛠️ Tech Stack

### Frontend
- **React 19** with Vite
- **React Router** for navigation
- **Tailwind CSS** for styling
- **React Hook Form** for form handling
- **Axios** for API calls
- **React Hot Toast** for notifications
- **Lucide React** for icons

### Backend
- **Node.js** with Express
- **MongoDB** with Mongoose
- **JWT** for authentication
- **bcryptjs** for password hashing
- **Express Validator** for input validation
- **CORS** for cross-origin requests

## 📁 Project Structure

```
sports-event-app/
├── server/                 # Backend API
│   ├── config/
│   │   └── db.js          # Database configuration
│   ├── controllers/        # Route controllers
│   │   ├── playerController.js
│   │   ├── coachController.js
│   │   └── teamController.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── models/            # MongoDB models
│   │   ├── Player.js
│   │   ├── Coach.js
│   │   └── Team.js
│   ├── routes/            # API routes
│   │   ├── playerRoutes.js
│   │   ├── coachRoutes.js
│   │   └── teamRoutes.js
│   ├── server.js          # Main server file
│   └── package.json
├── src/                    # Frontend React app
│   ├── components/        # Reusable components
│   │   ├── Navbar.jsx
│   │   ├── Dropdown.jsx
│   │   └── ProtectedRoute.jsx
│   ├── pages/             # Page components
│   │   ├── Home.jsx
│   │   ├── PlayerLogin.jsx
│   │   ├── PlayerRegister.jsx
│   │   ├── PlayerSelectTeam.jsx
│   │   ├── PlayerDashboard.jsx
│   │   ├── CoachLogin.jsx
│   │   ├── CoachRegister.jsx
│   │   ├── CoachCreateTeam.jsx
│   │   └── CoachDashboard.jsx
│   ├── services/
│   │   └── api.js          # API service layer
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── package.json
├── tailwind.config.js
└── README.md
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sports-event-app
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd server
   npm install
   cd ..
   ```

4. **Set up environment variables**
   
   Create `server/.env` file:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/sports-event-app
   JWT_SECRET=your-super-secret-jwt-key-here
   NODE_ENV=development
   ```

   Create `.env` file in root:
   ```env
   VITE_API_URL=http://localhost:5000/api
   ```

5. **Start MongoDB**
   ```bash
   # If using local MongoDB
   mongod
   ```

6. **Start the backend server**
   ```bash
   cd server
   npm run dev
   ```

7. **Start the frontend development server**
   ```bash
   # In a new terminal
   npm run dev
   ```

8. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000

## 🔧 API Endpoints

### Player Routes (`/api/players`)
- `POST /register` - Register a new player
- `POST /login` - Player login
- `GET /profile` - Get player profile (protected)
- `PUT /team` - Update player team (protected)
- `GET /teams` - Get all teams

### Coach Routes (`/api/coaches`)
- `POST /register` - Register a new coach
- `POST /login` - Coach login
- `GET /profile` - Get coach profile (protected)
- `POST /team` - Create team (protected)
- `GET /dashboard` - Get team dashboard (protected)
- `GET /search-players` - Search players (protected)
- `POST /add-player` - Add player to age group (protected)
- `DELETE /remove-player/:id` - Remove player from age group (protected)

### Team Routes (`/api/teams`)
- `GET /` - Get all teams
- `GET /:id` - Get team by ID
- `PUT /:id` - Update team (protected)
- `DELETE /:id` - Delete team (protected)
- `GET /:id/stats` - Get team statistics

## 🎯 User Flows

### Player Flow
1. **Home Page** → Click "Are you a Player?"
2. **Registration/Login** → Register with Aadhar number or login
3. **Team Selection** → Select a team to join (if not assigned)
4. **Dashboard** → View profile and team information

### Coach Flow
1. **Home Page** → Click "Are you a Coach?"
2. **Registration/Login** → Register with email or login
3. **Create Team** → Create a team (if not created)
4. **Dashboard** → Manage team, add players to age groups

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt for secure password storage
- **Input Validation**: Server-side validation for all inputs
- **Protected Routes**: Role-based access control
- **CORS Configuration**: Secure cross-origin requests

## 🎨 UI/UX Features

- **Responsive Design**: Mobile-first approach
- **Modern UI**: Clean and intuitive interface
- **Loading States**: User feedback during operations
- **Error Handling**: Comprehensive error messages
- **Toast Notifications**: Real-time feedback
- **Form Validation**: Client and server-side validation

## 🚀 Deployment

### Frontend (Vercel/Netlify)
1. Build the project: `npm run build`
2. Deploy the `dist` folder to your hosting service
3. Set environment variables in your hosting platform

### Backend (Railway/Heroku)
1. Deploy the `server` folder
2. Set environment variables:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `NODE_ENV`

### Database (MongoDB Atlas)
1. Create a MongoDB Atlas cluster
2. Get the connection string
3. Update `MONGODB_URI` in your environment variables

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

For support, email support@sportsevent.com or create an issue in the repository.

---

**Built with ❤️ for the sports community**