import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, CheckCircle, ArrowLeft, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { coachAPI } from '../services/api';

const CoachPayment = () => {
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);

  useEffect(() => {
    fetchTeamData();
  }, []);

  const fetchTeamData = async () => {
    try {
      const response = await coachAPI.getDashboard();
      setTeam(response.data.team);
    } catch (error) {
      toast.error('Failed to load team data');
      navigate('/coach/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    setProcessing(true);
    
    // Simulate payment processing
    setTimeout(async () => {
      try {
        // Submit team for competition
        await coachAPI.submitTeam();
        setPaymentComplete(true);
        toast.success('Payment successful! Team submitted for competition.');
      } catch (error) {
        toast.error('Payment failed. Please try again.');
      } finally {
        setProcessing(false);
      }
    }, 2000);
  };

  const calculateTotalAmount = () => {
    if (!team?.players) return 0;
    const playerCount = team.players.length;
    const baseAmount = 500; // Base registration fee
    const perPlayerAmount = 100; // Per player fee
    return baseAmount + (playerCount * perPlayerAmount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading payment details...</p>
        </div>
      </div>
    );
  }

  if (paymentComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full mx-4 text-center">
          <div className="bg-green-100 p-4 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Payment Successful!</h2>
          <p className="text-gray-600 mb-6">
            Your team "{team?.name}" has been successfully submitted for the competition.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/coach/dashboard')}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/coach/dashboard')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Team Registration Payment</h1>
          <p className="text-gray-600 mt-2">Complete your team registration for the competition</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Team Summary */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center mb-6">
              <div className="bg-blue-100 p-3 rounded-full">
                <Trophy className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <h2 className="text-xl font-bold text-gray-900">{team?.name}</h2>
                <p className="text-gray-600">Team Summary</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">Total Players</span>
                <span className="font-medium">{team?.players?.length || 0}</span>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-medium text-gray-900">Age Group Distribution:</h3>
                {team?.players && (() => {
                  const grouped = {};
                  team.players.forEach(player => {
                    const key = `${player.gender} ${player.ageGroup}`;
                    grouped[key] = (grouped[key] || 0) + 1;
                  });
                  
                  return Object.entries(grouped).map(([group, count]) => (
                    <div key={group} className="flex justify-between text-sm">
                      <span className="text-gray-600">{group}</span>
                      <span>{count} players</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Payment Details */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center mb-6">
              <div className="bg-green-100 p-3 rounded-full">
                <CreditCard className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <h2 className="text-xl font-bold text-gray-900">Payment Details</h2>
                <p className="text-gray-600">Registration fees</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between py-2">
                <span className="text-gray-600">Base Registration Fee</span>
                <span>₹500</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600">Per Player Fee ({team?.players?.length || 0} players)</span>
                <span>₹{((team?.players?.length || 0) * 100).toLocaleString()}</span>
              </div>
              <div className="border-t border-gray-200 pt-2">
                <div className="flex justify-between font-bold text-lg">
                  <span>Total Amount</span>
                  <span>₹{calculateTotalAmount().toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Payment Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Card Number
                </label>
                <input
                  type="text"
                  placeholder="1234 5678 9012 3456"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Expiry Date
                  </label>
                  <input
                    type="text"
                    placeholder="MM/YY"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CVV
                  </label>
                  <input
                    type="text"
                    placeholder="123"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cardholder Name
                </label>
                <input
                  type="text"
                  placeholder="John Doe"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <button
                onClick={handlePayment}
                disabled={processing}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {processing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing Payment...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay ₹{calculateTotalAmount().toLocaleString()}
                  </>
                )}
              </button>

              <p className="text-xs text-gray-500 text-center">
                This is a demo payment. No actual charges will be made.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoachPayment;