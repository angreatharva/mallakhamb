import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, CheckCircle, ArrowLeft, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { coachAPI } from '../services/api';
import { ResponsiveContainer } from '../components/responsive/ResponsiveContainer';
import { ResponsiveForm, ResponsiveFormField, ResponsiveInput, ResponsiveButton } from '../components/responsive/ResponsiveForm';
import { ResponsiveGrid } from '../components/responsive/ResponsiveGrid';
import { useResponsive } from '../hooks/useResponsive';

const CoachPayment = () => {
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const { isMobile, isTablet } = useResponsive();

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
        <ResponsiveContainer className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading payment details...</p>
        </ResponsiveContainer>
      </div>
    );
  }

  if (paymentComplete) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ResponsiveContainer maxWidth="tablet" className="text-center">
          <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8 max-w-md mx-auto">
            <div className="bg-green-100 p-4 rounded-full w-16 h-16 md:w-20 md:h-20 mx-auto mb-6 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 md:h-12 md:w-12 text-green-600" />
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">Payment Successful!</h2>
            <p className="text-gray-600 mb-6 text-sm md:text-base">
              Your team "{team?.name}" has been successfully submitted for the competition.
            </p>
            <ResponsiveButton
              onClick={() => navigate('/coach/dashboard')}
              variant="primary"
              className="w-full"
            >
              Back to Dashboard
            </ResponsiveButton>
          </div>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ResponsiveContainer maxWidth="desktop" className="py-6 md:py-8">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <button
            onClick={() => navigate('/coach/dashboard')}
            className="flex items-center text-gray-600 hover:text-gray-900 mb-4 min-h-[44px] px-2 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Team Registration Payment</h1>
          <p className="text-gray-600 mt-2 text-sm md:text-base">Complete your team registration for the competition</p>
        </div>

        {/* Mobile-first responsive layout */}
        <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-8">
          {/* Team Summary */}
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
            <div className="flex items-center mb-6">
              <div className="bg-blue-100 p-3 rounded-full">
                <Trophy className="h-5 w-5 md:h-6 md:w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <h2 className="text-lg md:text-xl font-bold text-gray-900">{team?.name}</h2>
                <p className="text-gray-600 text-sm md:text-base">Team Summary</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600 text-sm md:text-base">Total Players</span>
                <span className="font-medium text-sm md:text-base">{team?.players?.length || 0}</span>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-medium text-gray-900 text-sm md:text-base">Age Group Distribution:</h3>
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
          <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
            <div className="flex items-center mb-6">
              <div className="bg-green-100 p-3 rounded-full">
                <CreditCard className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <h2 className="text-lg md:text-xl font-bold text-gray-900">Payment Details</h2>
                <p className="text-gray-600 text-sm md:text-base">Registration fees</p>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between py-2">
                <span className="text-gray-600 text-sm md:text-base">Base Registration Fee</span>
                <span className="text-sm md:text-base">₹500</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600 text-sm md:text-base">Per Player Fee ({team?.players?.length || 0} players)</span>
                <span className="text-sm md:text-base">₹{((team?.players?.length || 0) * 100).toLocaleString()}</span>
              </div>
              <div className="border-t border-gray-200 pt-2">
                <div className="flex justify-between font-bold text-lg">
                  <span>Total Amount</span>
                  <span>₹{calculateTotalAmount().toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Payment Form - Mobile-optimized */}
            <ResponsiveForm className="space-y-4">
              <ResponsiveFormField
                label="Card Number"
                required
              >
                <ResponsiveInput
                  type="text"
                  placeholder="1234 5678 9012 3456"
                />
              </ResponsiveFormField>

              <div className="grid grid-cols-2 gap-4">
                <ResponsiveFormField
                  label="Expiry Date"
                  required
                >
                  <ResponsiveInput
                    type="text"
                    placeholder="MM/YY"
                  />
                </ResponsiveFormField>
                <ResponsiveFormField
                  label="CVV"
                  required
                >
                  <ResponsiveInput
                    type="text"
                    placeholder="123"
                  />
                </ResponsiveFormField>
              </div>

              <ResponsiveFormField
                label="Cardholder Name"
                required
              >
                <ResponsiveInput
                  type="text"
                  placeholder="John Doe"
                />
              </ResponsiveFormField>

              <ResponsiveButton
                onClick={handlePayment}
                disabled={processing}
                loading={processing}
                variant="primary"
                className="w-full flex items-center justify-center"
              >
                {processing ? (
                  'Processing Payment...'
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay ₹{calculateTotalAmount().toLocaleString()}
                  </>
                )}
              </ResponsiveButton>

              <p className="text-xs text-gray-500 text-center mt-4">
                This is a demo payment. No actual charges will be made.
              </p>
            </ResponsiveForm>
          </div>
        </div>
      </ResponsiveContainer>
    </div>
  );
};

export default CoachPayment;