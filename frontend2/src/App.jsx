// // App.jsx
// import React from 'react';
// import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// import { AuthProvider, useAuth } from './contexts/AuthContext';
// import Login from './components/auth/Login';
// import Register from './components/auth/Register';
// import Dashboard from './components/dashboard/Dashboard';

// // Composant pour protéger les routes
// function ProtectedRoute({ children }) {
//   const { isAuthenticated, loading } = useAuth();
//   const location = window.location.pathname;
  
//   if (loading) {
//     return <div className="loading">Chargement...</div>;
//   }
  
//   // Si non authentifié, rediriger vers login
//   if (!isAuthenticated) {
//     return <Navigate to="/login" replace />;
//   }
  
//   return children;
// }

// // Composant pour rediriger si déjà connecté
// function PublicRoute({ children }) {
//   const { isAuthenticated, loading } = useAuth();
  
//   if (loading) {
//     return <div className="loading">Chargement...</div>;
//   }
  
//   // Si déjà connecté, rediriger vers dashboard
//   if (isAuthenticated) {
//     return <Navigate to="/dashboard" replace />;
//   }
  
//   return children;
// }

// function AppContent() {
//   const { loading } = useAuth();
  
//   if (loading) {
//     return <div className="loading">Chargement...</div>;
//   }
  
//   return (
//     <Routes>
//       {/* Routes publiques (accessible sans connexion) */}
//       <Route 
//         path="/" 
//         element={<Navigate to="/login" replace />} 
//       />
//       <Route 
//         path="/login" 
//         element={
//           <PublicRoute>
//             <Login />
//           </PublicRoute>
//         } 
//       />
//       <Route 
//         path="/register" 
//         element={
//           <PublicRoute>
//             <Register />
//           </PublicRoute>
//         } 
//       />
      
//       {/* Routes protégées (nécessitent une connexion) */}
//       <Route 
//         path="/dashboard" 
//         element={
//           <ProtectedRoute>
//             <Dashboard />
//           </ProtectedRoute>
//         } 
//       />
      
//       {/* Fallback - 404 */}
//       <Route path="*" element={<Navigate to="/login" replace />} />
//     </Routes>
//   );
// }

// function App() {
//   return (
//     <Router>
//       <AuthProvider>
//         <AppContent />
//       </AuthProvider>
//     </Router>
//   );
// }

// export default App;



// App.jsx - Version combinée
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Dashboard from './pages/Dashboard'; // à ajuster si besoin
import ActivateSuccess from './components/auth/ActivateSuccess';
// Pages du premier projet (gestion des fichiers/dossiers)
/*import MyFolders from './pages/MyFolders';
import SharedByMe from './pages/SharedByMe';
import SharedWithMe from './pages/SharedWithMe';
import UploadPage from './pages/UploadPage';
import InvitationsPage from './pages/InvitationsPage';
import RecentFiles from './pages/RecentFiles';
import Favorites from './pages/Favorites';
import StorageStats from './pages/StorageStats';
import FolderView from './pages/FolderView';
*/
// Route protégée (nécessite authentification)
function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="loading">Chargement...</div>;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// Route publique (redirige si déjà connecté)
function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="loading">Chargement...</div>;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
}
if (!window.myWallet) {
  console.warn("SecureCloud Wallet extension non détectée");
  // Afficher un message invitant à installer l’extension
}
function AppContent() {
  const { loading } = useAuth();
  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <Routes>
      {/* Routes publiques */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

      {/* Routes protégées (fonctionnalités du premier projet) */}
      <Route path="/ActivateSuccess" element={<ActivateSuccess />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;