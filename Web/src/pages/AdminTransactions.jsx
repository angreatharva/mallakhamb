import { useState, useEffect } from 'react';
import { ReceiptIndianRupee, Filter, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI, superAdminAPI } from '../services/api';
import { useRouteContext } from '../contexts/RouteContext';
import { ResponsiveContainer } from '../components/responsive/ResponsiveContainer';
import { ResponsiveHeading, ResponsiveText } from '../components/responsive/ResponsiveTypography';

const AdminTransactions = () => {
  const { routePrefix } = useRouteContext();
  const isSuperAdmin = routePrefix === '/superadmin';
  const api = isSuperAdmin ? superAdminAPI : adminAPI;

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetition, setSelectedCompetition] = useState('');

  // For super admin, load competitions so they can pick one
  useEffect(() => {
    if (isSuperAdmin) {
      fetchCompetitions();
    } else {
      // Admins are already competition-scoped via navbar / competition context
      fetchTransactions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routePrefix]);

  // When super admin selects a competition, load its transactions
  useEffect(() => {
    if (isSuperAdmin && selectedCompetition) {
      fetchTransactions(selectedCompetition);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompetition]);

  const fetchCompetitions = async () => {
    try {
      const response = await superAdminAPI.getAllCompetitions();
      setCompetitions(response.data.competitions || []);
    } catch (error) {
      console.error('Failed to load competitions for transactions:', error);
      toast.error('Failed to load competitions');
    }
  };

  const fetchTransactions = async (competitionId) => {
    setLoading(true);
    try {
      const params = {};
      if (isSuperAdmin && competitionId) {
        params.competitionId = competitionId;
      }
      const response = await api.getTransactions(params);
      setTransactions(response.data.transactions || []);
    } catch (error) {
      console.error('Failed to load transactions:', error);
      const msg =
        error.response?.data?.message ||
        (isSuperAdmin ? 'Select a competition to view transactions' : 'Failed to load transactions');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount) => {
    if (amount === null || amount === undefined) return '-';
    return `₹${amount.toLocaleString()}`;
  };

  const formatDateTime = (value) => {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString();
    } catch {
      return '-';
    }
  };

  const renderEmptyState = () => {
    if (isSuperAdmin && !selectedCompetition) {
      return (
        <div className="text-center py-8 text-gray-500">
          <Filter className="h-10 w-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">Select a competition to view transactions.</p>
        </div>
      );
    }

    return (
      <div className="text-center py-8 text-gray-500">
        <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
        <p>No transactions found for the selected competition.</p>
      </div>
    );
  };

  return (
    <ResponsiveContainer maxWidth="desktop" padding="responsive">
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-lg p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-purple-100 p-3 rounded-full">
              <ReceiptIndianRupee className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <ResponsiveHeading level={3} className="text-gray-900">
                Transactions
              </ResponsiveHeading>
              <ResponsiveText size="sm" className="text-gray-600">
                Competition-specific payments and player additions
              </ResponsiveText>
            </div>
          </div>

          {isSuperAdmin && (
            <div className="w-64">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Select Competition
              </label>
              <select
                value={selectedCompetition}
                onChange={(e) => setSelectedCompetition(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              >
                <option value="">Choose competition...</option>
                {competitions.map((comp) => (
                  <option key={comp._id} value={comp._id}>
                    {(() => {
                      const nameWithYear = `${comp.name}${
                        comp.year ? ` (${comp.year})` : ''
                      }`;

                      const metaParts = [];
                      if (comp.level) metaParts.push(comp.level);
                      if (comp.place) metaParts.push(comp.place);

                      const metaSuffix = metaParts.length
                        ? ` - ${metaParts.join(' - ')}`
                        : '';

                      return `${nameWithYear}${metaSuffix}`;
                    })()}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          {loading ? (
            <div className="text-center py-10">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <p className="text-gray-500 text-sm">Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            renderEmptyState()
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Date / Time
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Competition
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Team
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Player
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((tx) => {
                    const competitionLabel = tx.competition
                      ? `${tx.competition.name}${
                          tx.competition.year ? ` (${tx.competition.year})` : ''
                        }${tx.competition.place ? ` - ${tx.competition.place}` : ''}`
                      : '-';

                    const teamName = tx.team?.name || '-';
                    const playerName = tx.player
                      ? `${tx.player.firstName || ''} ${tx.player.lastName || ''}`.trim() ||
                        tx.player.email
                      : '-';

                    const typeLabel =
                      tx.type === 'team_submission'
                        ? 'Team Submission'
                        : tx.type === 'player_add'
                        ? 'Player Added'
                        : 'Other';

                    const sourceLabel =
                      tx.source === 'coach'
                        ? 'Coach'
                        : tx.source === 'superadmin'
                        ? 'Super Admin'
                        : tx.source;

                    const statusClasses =
                      tx.paymentStatus === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : tx.paymentStatus === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800';

                    return (
                      <tr key={tx.id}>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {formatDateTime(tx.createdAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {typeLabel}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {sourceLabel}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {competitionLabel}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {teamName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                          {playerName}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">
                          {formatAmount(tx.amount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClasses}`}
                          >
                            {tx.paymentStatus || 'unknown'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ResponsiveContainer>
  );
};

export default AdminTransactions;

