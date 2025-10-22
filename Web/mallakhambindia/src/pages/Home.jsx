import { Link } from 'react-router-dom';
import { Users, UserCheck, Trophy, Star } from 'lucide-react';

const Home = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <Trophy className="h-16 w-16 text-blue-600" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Sports Event Entry
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Join the ultimate sports competition platform. Register as a player or coach 
            and be part of an amazing sporting community.
          </p>
        </div>

        {/* Main Options */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
          {/* Player Option */}
          <Link
            to="/player"
            className="group bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 p-8 text-center"
          >
            <div className="flex justify-center mb-6">
              <div className="bg-blue-100 p-4 rounded-full">
                <Users className="h-12 w-12 text-blue-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Are you a Player?</h2>
            <p className="text-gray-600 mb-6">
              Register as a player and join teams to participate in various sports events. 
              Track your progress and compete with other athletes.
            </p>
            <div className="inline-flex items-center text-blue-600 font-semibold group-hover:text-blue-700">
              Get Started as Player
              <Star className="ml-2 h-4 w-4" />
            </div>
          </Link>

          {/* Coach Option */}
          <Link
            to="/coach"
            className="group bg-white rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 p-8 text-center"
          >
            <div className="flex justify-center mb-6">
              <div className="bg-green-100 p-4 rounded-full">
                <UserCheck className="h-12 w-12 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Are you a Coach?</h2>
            <p className="text-gray-600 mb-6">
              Register as a coach and manage your team. Create teams, assign players to 
              age groups, and track team performance.
            </p>
            <div className="inline-flex items-center text-green-600 font-semibold group-hover:text-green-700">
              Get Started as Coach
              <Star className="ml-2 h-4 w-4" />
            </div>
          </Link>
        </div>



        {/* Features Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold text-gray-900 text-center mb-8">
            Why Choose Our Platform?
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="bg-blue-100 p-3 rounded-full w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                <Trophy className="h-6 w-6 text-blue-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Competitive Events</h4>
              <p className="text-sm text-gray-600">
                Participate in various age group competitions
              </p>
            </div>
            <div className="text-center">
              <div className="bg-green-100 p-3 rounded-full w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Team Management</h4>
              <p className="text-sm text-gray-600">
                Easy team creation and player management
              </p>
            </div>
            <div className="text-center">
              <div className="bg-purple-100 p-3 rounded-full w-12 h-12 mx-auto mb-4 flex items-center justify-center">
                <Star className="h-6 w-6 text-purple-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Track Progress</h4>
              <p className="text-sm text-gray-600">
                Monitor your performance and achievements
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
