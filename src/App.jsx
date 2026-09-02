import React, { useEffect, useState, useCallback } from "react";
import EmployeeSide from "./pages/EmployeeSide";
import OwnerSide from "./pages/OwnerSide";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to) => {
    window.history.pushState({}, "", to);
    setPath(to);
  }, []);

  if (path.startsWith("/titolare")) {
    return <OwnerSide navigate={navigate} />;
  }
  return <EmployeeSide navigate={navigate} />;
}
