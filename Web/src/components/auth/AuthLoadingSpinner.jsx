import { useResponsive } from '@/hooks/useResponsive';

export const AuthLoadingSpinner = () => {
  const { isMobile } = useResponsive();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <div className="text-center max-w-sm w-full">
        <div 
          className={`animate-spin rounded-full border-b-2 mx-auto ${
            isMobile ? 'h-8 w-8' : 'h-12 w-12'
          }`}
          style={{ borderColor: 'rgb(var(--accent))' }}
        ></div>
        <p className={`mt-4 ${
          isMobile ? 'text-sm' : 'text-base'
        } text-fg-secondary`}>
          Loading...
        </p>
      </div>
    </div>
  );
};

export default AuthLoadingSpinner;
