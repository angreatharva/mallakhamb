import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompetition } from '@/contexts/CompetitionContext';
import { ChevronDown, Check, Search, X, PlusCircle, MapPin, Calendar } from 'lucide-react';
import { StatusTag, Tag } from '@/components/ui';
import toast from 'react-hot-toast';
import { logger } from '@/infrastructure/logger';
import { levelLabel } from '@/utils/competition/levels';
import { BodyScrollLock } from '@/hooks/useBodyScrollLock';


/** A meet's stored status, as a status tag; "completed" is a plain tag. */
const STATUS = { ongoing: 'success', upcoming: 'info' };

const CompetitionSelector = ({ userType }) => {
  const navigate = useNavigate();
  const { currentCompetition, assignedCompetitions, switchCompetition, isLoading } = useCompetition();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef(null);

  // Log when currentCompetition changes
  useEffect(() => {
    logger.info('CompetitionSelector: currentCompetition changed', {
      hasCompetition: !!currentCompetition,
      competitionId: currentCompetition?._id,
      competitionName: currentCompetition?.name,
      competitionYear: currentCompetition?.year,
      userType,
      assignedCount: assignedCompetitions?.length
    });
  }, [currentCompetition, userType, assignedCompetitions]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const handleSwitch = async (competitionId) => {
    if (competitionId === currentCompetition?._id) { 
      logger.info('Competition already selected, closing dropdown', { competitionId });
      setIsOpen(false); 
      return; 
    }
    
    const targetCompetition = assignedCompetitions?.find(c => c._id === competitionId);
    logger.info('Switching competition', { 
      from: currentCompetition?._id, 
      to: competitionId,
      fromName: currentCompetition?.name,
      toName: targetCompetition?.name
    });
    
    try {
      setIsSwitching(true);
      await switchCompetition(competitionId);
      logger.info('Competition switched successfully', { competitionId });
      setIsOpen(false);
      
      // Show success toast
      if (targetCompetition) {
        toast.success(`Switched to ${targetCompetition.name}${targetCompetition.year ? ` ${targetCompetition.year}` : ''}`);
      }
    } catch (error) {
      logger.error('Failed to switch competition:', error);
      toast.error('Failed to switch competition. Please try again.');
    } finally {
      setIsSwitching(false);
    }
  };

  const handleNewRegistration = () => {
    setIsOpen(false);
    // Only coaches can register for new competitions
    // Players join teams, which are already registered in competitions
    if (userType === 'coach') navigate('/coach/select-competition');
  };

  const filteredCompetitions = assignedCompetitions?.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.place?.toLowerCase().includes(q) ||
      c.level?.toLowerCase().includes(q) ||
      c.status?.toLowerCase().includes(q)
    );
  });

  // Don't show selector in certain conditions
  if (userType === 'admin' && (!assignedCompetitions || assignedCompetitions.length <= 1)) return null;
  // For coaches, always show the selector (even with 0 competitions) so they can register for new ones
  // For players, hide if no competitions
  if (userType === 'player' && (!assignedCompetitions || assignedCompetitions.length === 0)) return null;

  // Show loading state inside the button instead of hiding the entire component
  const isLoadingOrSwitching = isLoading || isSwitching;

  return (
    <div className="relative" ref={dropdownRef} key={`${currentCompetition?._id || 'no-competition'}-${assignedCompetitions?.length || 0}`}>
      <button
        type="button"
        onClick={() => !isLoadingOrSwitching && setIsOpen(!isOpen)}
        disabled={isLoadingOrSwitching}
        className="ui-picker"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select competition"
      >
        <span className="ui-picker__text">
          <span className="ui-picker__label type-tag">Competition</span>
          <span className="ui-picker__value" key={currentCompetition?._id}>
            {currentCompetition
              ? `${currentCompetition.name}${currentCompetition.year ? ` ${currentCompetition.year}` : ''}`
              : (userType === 'coach' ? 'Select Competition' : 'Select')}
          </span>
        </span>
        <ChevronDown className="ui-picker__chevron" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="ui-popover ui-popover--wide ui-fade-in" role="listbox">
          {/* Header */}
          <p className="ui-popover__title type-tag">
            {userType === 'coach' && (!assignedCompetitions || assignedCompetitions.length === 0)
              ? 'Select Competition'
              : 'Switch Competition'}
          </p>

          {/* Search */}
          {assignedCompetitions && assignedCompetitions.length > 3 && (
            <div className="ui-popover__search">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-fg-muted pointer-events-none z-10" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search competitions..." aria-label="Search competitions"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ui-input pl-8 pr-10"
                  onClick={(e) => e.stopPropagation()}
                />
                {searchQuery && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); setSearchQuery(''); }}
                    className="ui-popover__clear"
                    aria-label="Clear search">
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* List */}
          <div className="ui-popover__list">
            {filteredCompetitions && filteredCompetitions.length === 0 ? (
              <p className="ui-popover__empty type-body-s">
                No competitions found for &quot;{searchQuery}&quot;
              </p>
            ) : (
              filteredCompetitions?.map((competition) => {
                const isActive = currentCompetition?._id === competition._id;
                const status = STATUS[competition.status];
                return (
                  <button
                    type="button"
                    key={competition._id}
                    onClick={() => handleSwitch(competition._id)}
                    disabled={isSwitching}
                    className="ui-popover__option"
                    role="option"
                    aria-selected={isActive}
                  >
                    <span className="flex-1 min-w-0 grid gap-1">
                      <span className="flex items-center gap-2">
                        <span className="ui-popover__option-name">
                          {competition.name} {competition.year || ''}
                        </span>
                        {isActive && <Check className="w-3.5 h-3.5 flex-shrink-0 text-accent-fg" aria-hidden="true" />}
                      </span>
                      <span className="flex items-center gap-x-3 gap-y-1 flex-wrap type-caption text-fg-muted">
                        {competition.place && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" aria-hidden="true" />
                            {competition.place}
                          </span>
                        )}
                        <span>{levelLabel(competition.level)}</span>
                        {competition.startDate && competition.endDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" aria-hidden="true" />
                            {new Date(competition.startDate).toLocaleDateString()} –{' '}
                            {new Date(competition.endDate).toLocaleDateString()}
                          </span>
                        )}
                      </span>
                    </span>
                    {competition.status && (status
                      ? <StatusTag status={status} className="flex-shrink-0">{competition.status}</StatusTag>
                      : <Tag className="flex-shrink-0">{competition.status}</Tag>)}
                  </button>
                );
              })
            )}
          </div>

          {/* Register new - only for coaches */}
          {userType === 'coach' && (
            <div className="ui-popover__foot">
              <button
                type="button"
                onClick={handleNewRegistration}
                disabled={isSwitching}
                className="ui-popover__option"
              >
                <PlusCircle className="w-4 h-4 flex-shrink-0 text-accent-fg" aria-hidden="true" />
                <span className="grid gap-0.5">
                  <span className="ui-popover__option-name">Sign up for new competition</span>
                  <span className="type-caption text-fg-muted">Register your team</span>
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Switching overlay */}
      {isSwitching && (
        <div className="modal-overlay ui-dialog-overlay z-[100]">
          <BodyScrollLock />
          <div className="modal-panel ui-popover__busy">
            <span className="ui-spinner text-accent-fg" aria-hidden="true" />
            <span className="type-body-s">Switching competition...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompetitionSelector;
