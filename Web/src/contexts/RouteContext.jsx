import React, { createContext, useContext } from 'react';

// Create context with default values for admin routes
const RouteContext = createContext({
  routePrefix: "/admin",
  storagePrefix: "admin"
});

// Custom hook to use the route context
export const useRouteContext = () => {
  return useContext(RouteContext);
};

// Provider component that accepts value prop and wraps children
export const RouteContextProvider = ({ value, children }) => {
  return (
    <RouteContext.Provider value={value}>
      {children}
    </RouteContext.Provider>
  );
};

export default RouteContext;
