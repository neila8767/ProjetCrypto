// frontend/src/pages/ActivateSuccess.jsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Download,
  Printer,
  Home,
  FileText,
  Calendar,
  Fingerprint,
  Hash,
  User,
  Mail,
  AlertCircle,
  Shield,
  Clock,
  Copy,
  Check,
  ExternalLink
} from 'lucide-react';

const ActivateSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState({});
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    console.log('📍 Page ActivateSuccess chargée');
    console.log('🔍 Search params:', location.search);
    
    const params = new URLSearchParams(location.search);
    const certificatesCount = params.get('certificates');
    const certificatesData = params.get('data');
    
    console.log('📊 Certificats count:', certificatesCount);
    console.log('📊 Data reçue:', certificatesData);
    
    if (certificatesData) {
      try {
        const decodedData = JSON.parse(decodeURIComponent(certificatesData));
        console.log('✅ Données décodées:', decodedData);
        setCertificates(decodedData);
      } catch (error) {
        console.error('❌ Erreur parsing:', error);
      }
    }
    
    // Récupérer l'email depuis le localStorage ou le state
    const email = localStorage.getItem('userEmail') || '';
    setUserEmail(email);
    
    setLoading(false);
  }, [location]);

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopied({ ...copied, [field]: true });
    setTimeout(() => {
      setCopied({ ...copied, [field]: false });
    }, 2000);
  };

  const handleDownloadJSON = () => {
    const data = {
      generatedAt: new Date().toISOString(),
      userEmail: userEmail,
      certificates: certificates,
      totalCertificates: certificates.length,
      message: "Certificats générés lors de l'activation du compte"
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificats_activation_${new Date().getTime()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCSV = () => {
    const headers = ['Account ID', 'Account Name', 'Type', 'Fingerprint', 'Serial Number', 'Valid Until'];
    const rows = certificates.map(cert => [
      cert.accountId || 'N/A',
      cert.accountName || 'N/A',
      cert.accountType || 'N/A',
      cert.fingerprint || 'N/A',
      cert.serialNumber || 'N/A',
      cert.validUntil ? new Date(cert.validUntil).toLocaleDateString('fr-FR') : 'N/A'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificats_activation_${new Date().getTime()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDaysUntilExpiration = (dateString) => {
    if (!dateString) return null;
    const expirationDate = new Date(dateString);
    const today = new Date();
    const diffTime = expirationDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-6 text-gray-600 font-medium">Chargement de vos certificats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header avec animation */}
        <div className="text-center mb-10 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full mb-6 shadow-lg animate-bounce-in">
            <CheckCircle className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-3">
            Activation réussie !
          </h1>
          <p className="text-xl text-gray-600">
            Votre compte a été activé et vos certificats ont été générés
          </p>
        </div>

        {/* Cartes de statistiques */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Certificats</p>
                <p className="text-3xl font-bold text-purple-600 mt-1">{certificates.length}</p>
              </div>
              <div className="bg-purple-100 rounded-full p-3">
                <FileText className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Validité</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">365</p>
              </div>
              <div className="bg-blue-100 rounded-full p-3">
                <Calendar className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">jours</p>
          </div>
          
          <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Statut</p>
                <p className="text-3xl font-bold text-green-600 mt-1">Actif</p>
              </div>
              <div className="bg-green-100 rounded-full p-3">
                <Shield className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm font-medium">Sécurité</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">RSA</p>
              </div>
              <div className="bg-orange-100 rounded-full p-3">
                <Shield className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">2048 bits</p>
          </div>
        </div>

        {/* Alertes informatives */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <p className="font-semibold text-blue-900">Information importante</p>
                <p className="text-sm text-blue-700 mt-1">
                  Vos certificats sont maintenant enregistrés et associés à votre compte. 
                  Ils seront utilisés pour authentifier vos transactions futures.
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-yellow-50 border-l-4 border-yellow-500 rounded-lg p-4">
            <div className="flex items-start">
              <Shield className="w-5 h-5 text-yellow-500 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <p className="font-semibold text-yellow-900">Conservation sécurisée</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Conservez ces informations en lieu sûr. L'empreinte du certificat vous sera 
                  demandée pour certaines opérations sensibles.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Section des certificats */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-10">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-white flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Certificats générés
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handleDownloadJSON}
                  className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-3 py-1 rounded-lg text-sm transition-all flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  JSON
                </button>
                <button
                  onClick={handleDownloadCSV}
                  className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-3 py-1 rounded-lg text-sm transition-all flex items-center gap-1"
                >
                  <Download className="w-4 h-4" />
                  CSV
                </button>
                <button
                  onClick={handlePrint}
                  className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-3 py-1 rounded-lg text-sm transition-all flex items-center gap-1"
                >
                  <Printer className="w-4 h-4" />
                  Imprimer
                </button>
              </div>
            </div>
          </div>

          {certificates.length === 0 ? (
            <div className="p-12 text-center">
              <AlertCircle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">
                Aucun détail de certificat disponible.
              </p>
              <p className="text-gray-400 text-sm mt-2">
                Veuillez contacter le support si le problème persiste.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {certificates.map((cert, index) => {
                const daysUntilExpiry = getDaysUntilExpiration(cert.validUntil);
                const isExpiringSoon = daysUntilExpiry && daysUntilExpiry <= 30;
                
                return (
                  <div key={index} className="p-6 hover:bg-gray-50 transition-all duration-300">
                    {/* En-tête du certificat */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                          {cert.accountName || 'Sans nom'}
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                            {cert.accountType || 'Standard'}
                          </span>
                          {isExpiringSoon && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <Clock className="w-3 h-3 mr-1" />
                              Expire bientôt
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Généré le {new Date().toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDownloadJSON()}
                        className="mt-2 md:mt-0 text-purple-600 hover:text-purple-700 text-sm font-medium flex items-center gap-1"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Exporter
                      </button>
                    </div>

                    {/* Détails du certificat - Grille professionnelle */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Account ID */}
                      <div className="bg-gray-50 rounded-lg p-3 group hover:bg-gray-100 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                              ID du compte
                            </p>
                          </div>
                          {cert.accountId && (
                            <button
                              onClick={() => handleCopy(cert.accountId, `accountId_${index}`)}
                              className="text-gray-400 hover:text-purple-600 transition-colors"
                            >
                              {copied[`accountId_${index}`] ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                        <p className="text-sm font-mono text-gray-900 break-all">
                          {cert.accountId || 'N/A'}
                        </p>
                      </div>

                      {/* Fingerprint */}
                      <div className="bg-gray-50 rounded-lg p-3 group hover:bg-gray-100 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Fingerprint className="w-4 h-4 text-gray-400" />
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                              Empreinte SHA-256
                            </p>
                          </div>
                          {cert.fingerprint && (
                            <button
                              onClick={() => handleCopy(cert.fingerprint, `fingerprint_${index}`)}
                              className="text-gray-400 hover:text-purple-600 transition-colors"
                            >
                              {copied[`fingerprint_${index}`] ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                        <p className="text-sm font-mono text-gray-900 break-all">
                          {cert.fingerprint || 'N/A'}
                        </p>
                      </div>

                      {/* Serial Number */}
                      <div className="bg-gray-50 rounded-lg p-3 group hover:bg-gray-100 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <Hash className="w-4 h-4 text-gray-400" />
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                              Numéro de série
                            </p>
                          </div>
                          {cert.serialNumber && (
                            <button
                              onClick={() => handleCopy(cert.serialNumber, `serial_${index}`)}
                              className="text-gray-400 hover:text-purple-600 transition-colors"
                            >
                              {copied[`serial_${index}`] ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                        <p className="text-sm font-mono text-gray-900 break-all">
                          {cert.serialNumber || 'N/A'}
                        </p>
                      </div>

                      {/* Valid Until */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                            Date d'expiration
                          </p>
                        </div>
                        <p className="text-sm text-gray-900 font-medium">
                          {formatDate(cert.validUntil)}
                        </p>
                        {daysUntilExpiry && (
                          <p className={`text-xs mt-1 ${isExpiringSoon ? 'text-red-600' : 'text-gray-500'}`}>
                            {daysUntilExpiry > 0 
                              ? `Expire dans ${daysUntilExpiry} jours`
                              : 'Certificat expiré'}
                          </p>
                        )}
                      </div>

                      {/* Type de clé */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Shield className="w-4 h-4 text-gray-400" />
                          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                            Algorithme
                          </p>
                        </div>
                        <p className="text-sm text-gray-900">RSA-2048</p>
                        <p className="text-xs text-gray-500 mt-1">SHA-256 with RSA</p>
                      </div>

                      {/* Usage */}
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
                            Usages autorisés
                          </p>
                        </div>
                        <p className="text-sm text-gray-900">Authentification client</p>
                        <p className="text-xs text-gray-500 mt-1">Signature numérique</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap justify-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all duration-300 transform hover:scale-105 shadow-md"
          >
            <Home className="w-4 h-4 mr-2" />
            Accéder au tableau de bord
          </button>
          <button
            onClick={handleDownloadJSON}
            className="inline-flex items-center px-6 py-3 bg-gray-700 text-white font-medium rounded-lg hover:bg-gray-800 transition-all duration-300 transform hover:scale-105 shadow-md"
          >
            <Download className="w-4 h-4 mr-2" />
            Télécharger tous les certificats
          </button>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center border-t border-gray-200 pt-8">
          <p className="text-sm text-gray-500">
            © 2024 - Votre Application | Activation réussie le {new Date().toLocaleDateString('fr-FR', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Ceci est une confirmation automatique, merci de ne pas y répondre.
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes bounceIn {
          0% {
            opacity: 0;
            transform: scale(0.3);
          }
          50% {
            opacity: 1;
            transform: scale(1.05);
          }
          70% {
            transform: scale(0.9);
          }
          100% {
            transform: scale(1);
          }
        }
        
        .animate-fade-in-up {
          animation: fadeInUp 0.6s ease-out;
        }
        
        .animate-bounce-in {
          animation: bounceIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        
        @media print {
          .min-h-screen {
            background: white !important;
          }
          .animate-fade-in-up,
          .animate-bounce-in {
            animation: none !important;
          }
          button {
            display: none !important;
          }
          .shadow-lg, .shadow-md {
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default ActivateSuccess;