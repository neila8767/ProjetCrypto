// content.js - Version corrigée avec support signature et transmission complète
console.log('🔴 [CONTENT] === DÉBUT DU SCRIPT ===');
console.log('🔴 [CONTENT] URL:', window.location.href);
console.log('🔴 [CONTENT] Timestamp:', new Date().toISOString());

// Vérification de l'environnement d'extension
const isExtensionContext = () => {
  try {
    return !!chrome?.runtime?.id;
  } catch (e) {
    return false;
  }
};

console.log('🔴 [CONTENT] Chrome extension ID:', chrome?.runtime?.id || 'non disponible');
console.log('🔴 [CONTENT] isExtensionContext:', isExtensionContext());

// Fonction d'injection
function injectScript() {
  console.log('🟢 [CONTENT] Injection du script inpage.js');
  
  try {
    // Vérifier que chrome.runtime est disponible avant d'appeler getURL
    if (!chrome?.runtime?.getURL) {
      console.error('❌ [CONTENT] chrome.runtime.getURL non disponible');
      return;
    }
    
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inpage.js');
    console.log('🟢 [CONTENT] Script src:', script.src);
    
    script.onload = () => {
      console.log('✅ [CONTENT] Script inpage.js chargé avec succès');
      script.remove();
    };
    
    script.onerror = (err) => {
      console.error('❌ [CONTENT] Erreur chargement inpage.js:', err);
    };
    
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(script);
      console.log('✅ [CONTENT] Script injecté dans', target.tagName);
    } else {
      console.error('❌ [CONTENT] Aucun élément head ou documentElement trouvé');
    }
    
  } catch (error) {
    console.error('❌ [CONTENT] Erreur injection:', error);
  }
}

// Attendre que chrome.runtime soit disponible
function waitForRuntime(callback, maxAttempts = 10) {
  let attempts = 0;
  
  const checkRuntime = () => {
    attempts++;
    console.log(`🟢 [CONTENT] Vérification runtime (tentative ${attempts}/${maxAttempts})...`);
    
    if (chrome?.runtime?.id) {
      console.log('✅ [CONTENT] chrome.runtime disponible');
      callback();
    } else if (attempts < maxAttempts) {
      console.log(`⏳ [CONTENT] En attente de chrome.runtime... (${attempts}/${maxAttempts})`);
      setTimeout(checkRuntime, 200);
    } else {
      console.error('❌ [CONTENT] chrome.runtime non disponible après plusieurs tentatives');
      // Injection quand même ? Non, mieux vaut ne pas injecter si l'extension n'est pas prête
    }
  };
  
  checkRuntime();
}

// Injection sécurisée
if (document.readyState === 'loading') {
  console.log('🟢 [CONTENT] Document en chargement, injection après DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', () => {
    waitForRuntime(injectScript);
  });
} else {
  console.log('🟢 [CONTENT] Document déjà chargé, injection immédiate');
  waitForRuntime(injectScript);
}

// Gestion des messages avec vérification de sécurité
window.addEventListener('message', (event) => {
  console.log('📨 [CONTENT] Message reçu:', {
    source: event.source === window ? 'window' : 'other',
    action: event.data?.action,
    requestId: event.data?.requestId,
    type: event.data?.type
  });
  
  // Vérifier que le message vient de la page elle-même
  if (event.source !== window) return;
  
  const { action, payload, requestId, type } = event.data;
  
  // Gérer les messages de type wallet:
  if (action && action.startsWith('wallet:')) {
    const actionName = action.slice(7);
    console.log('🎯 [CONTENT] Action wallet détectée:', actionName);
    console.log('📦 [CONTENT] Payload:', payload);
    console.log('🆔 [CONTENT] RequestId:', requestId);
    
    // Vérifier que chrome.runtime est disponible
    if (!chrome?.runtime?.id) {
      console.error('❌ [CONTENT] chrome.runtime indisponible');
      window.postMessage({ 
        type: 'SECURECLOUD_RESPONSE',
        requestId: requestId, 
        error: 'Extension context not available. Please reload the page.' 
      }, '*');
      return;
    }
    
    if (!chrome.runtime.sendMessage) {
      console.error('❌ [CONTENT] chrome.runtime.sendMessage indisponible');
      window.postMessage({ 
        type: 'SECURECLOUD_RESPONSE',
        requestId: requestId, 
        error: 'chrome.runtime.sendMessage not available' 
      }, '*');
      return;
    }
    
    console.log('📤 [CONTENT] Envoi au background:', { action: actionName, payload });
    
    try {
      chrome.runtime.sendMessage(
        { action: actionName, payload, requestId, origin: window.location.origin },
        (response) => {
          // Gérer les erreurs de dernière minute
          if (chrome.runtime.lastError) {
            console.error('❌ [CONTENT] Erreur runtime:', chrome.runtime.lastError);
            window.postMessage({ 
              type: 'SECURECLOUD_RESPONSE',
              requestId: requestId, 
              error: chrome.runtime.lastError.message 
            }, '*');
          } else {
            console.log('✅ [CONTENT] Réponse reçue du background:', response);
            // Transmettre la réponse complète (avec signature ET accountId)
            window.postMessage({ 
              type: 'SECURECLOUD_RESPONSE',
              requestId: requestId, 
              result: response
            }, '*');
          }
        }
      );
    } catch (err) {
      console.error('❌ [CONTENT] Exception lors de sendMessage:', err);
      window.postMessage({ 
        type: 'SECURECLOUD_RESPONSE',
        requestId: requestId, 
        error: err.message 
      }, '*');
    }
  }
  
  // Gérer les messages de type notification de l'extension
  if (type === 'securecloud:unlocked' || type === 'securecloud:locked') {
    console.log('🔔 [CONTENT] Notification extension:', type);
    // Relayer à la page
    window.postMessage(event.data, '*');
  }
});

// Écouter les messages du background (popup etc)
try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('📨 [CONTENT] Message du background:', message);
    
    if (message.type === 'SIGNATURE_RESPONSE' || message.type === 'PENDING_REQUEST') {
      // Relayer à la page
      window.postMessage(message, '*');
      sendResponse({ received: true });
    }
    
    return true;
  });
} catch (err) {
  console.error('❌ [CONTENT] Erreur ajout listener onMessage:', err);
}

console.log('✅ [CONTENT] Content script prêt');
console.log('🌐 [CONTENT] URL actuelle:', window.location.href);
console.log('📄 [CONTENT] Document readyState:', document.readyState);