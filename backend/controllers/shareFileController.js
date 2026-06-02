

const { sendShareFileEmail} = require('../utils/emailUtils_fus');
// controllers/shareController.js
const pool = require('../config/db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const forge = require('node-forge');



class ShareController {


static async shareFile(req, res) {
    console.log('\n🔗 [SHARE] ====== DÉBUT PARTAGE FICHIER ======');
    console.log('📥 Requête reçue à:', new Date().toISOString());
    console.log('👤 User ID:', req.user?.userId);
    console.log('📧 User Email:', req.user?.email);
    console.log('📝 Body:', req.body);

    const client = await pool.connect();
    console.log('🔌 [DB] Client connecté');

    try {
        const { fileId, recipientEmail, decryptedAesKey, reencryptedAesKey } = req.body;
        const ownerId = req.user.userId;

        console.log('📦 [SHARE] Données extraites:', {
            fileId,
            recipientEmail,
            hasDecryptedKey: !!decryptedAesKey,
            hasReencryptedKey: !!reencryptedAesKey
        });

        if (!fileId || !recipientEmail || !decryptedAesKey) {
            console.log('❌ [SHARE] Paramètres manquants');
            return res.status(400).json({
                success: false,
                message: "File ID, email destinataire et clé AES déchiffrée requis"
            });
        }

        console.log('✅ [SHARE] Clé AES déchiffrée reçue du frontend');
        console.log(`   - Taille clé: ${decryptedAesKey.length} bytes`);
        if (reencryptedAesKey) {
            console.log(`   - Clé rechiffrée reçue: ${reencryptedAesKey.length} bytes`);
        }

        await client.query('BEGIN');
        console.log('🔓 Transaction BEGIN');

        // 1. Vérification fichier
        console.log('🔍 [SHARE] Vérification propriété fichier...');
        const fileCheck = await client.query(
            `SELECT f.id, f.filename, f.size, f.owner_id
             FROM files f
             WHERE f.id = $1 AND f.owner_id = $2`,
            [fileId, ownerId]
        );

        console.log(`📊 [DB] Résultat fileCheck: ${fileCheck.rowCount} lignes`);

        if (fileCheck.rows.length === 0) {
            console.log('❌ [SHARE] Fichier non trouvé ou non autorisé');
            await client.query('ROLLBACK');
            console.log('↩️ Transaction ROLLBACK');
            return res.status(404).json({
                success: false,
                message: "Fichier non trouvé ou vous n'êtes pas le propriétaire"
            });
        }

        const file = fileCheck.rows[0];
        console.log('✅ [SHARE] Fichier trouvé:', file);

        // 2. Destinataire
        console.log('🔍 [SHARE] Recherche du destinataire...');
        const recipientResult = await client.query(
            `SELECT id, email FROM users WHERE email = $1 AND is_active = true`,
            [recipientEmail]
        );

        console.log(`📊 [DB] Résultat recipient: ${recipientResult.rowCount} lignes`);

        if (recipientResult.rows.length === 0) {
            console.log('❌ [SHARE] Destinataire non trouvé');
            await client.query('ROLLBACK');
            console.log('↩️ Transaction ROLLBACK');
            return res.status(404).json({
                success: false,
                message: "Utilisateur destinataire non trouvé"
            });
        }

        const recipient = recipientResult.rows[0];
        console.log('✅ [SHARE] Destinataire trouvé:', recipient);

        // 3. Clé partage destinataire
        console.log('🔍 [SHARE] Récupération clé publique de partage du destinataire...');
        const recipientShareKey = await client.query(
            `SELECT w.wallet_account_id, w.account_name, w.account_type,
                    c.cert_pem, c.fingerprint_sha256
             FROM wallet_accounts w
             JOIN client_certificates c ON c.fingerprint_sha256 = w.certificate_fingerprint
             WHERE w.user_id = $1 AND w.account_type = 'sharing'`,
            [recipient.id]
        );

        console.log(`📊 [DB] Résultat clé partage destinataire: ${recipientShareKey.rowCount}`);

        if (recipientShareKey.rows.length === 0) {
            console.log('❌ [SHARE] Aucune clé de partage trouvée pour le destinataire');
            await client.query('ROLLBACK');
            console.log('↩️ Transaction ROLLBACK');
            return res.status(404).json({
                success: false,
                message: "Le destinataire n'a pas de compte de partage configuré"
            });
        }

        const recipientWallet = recipientShareKey.rows[0];
        console.log('✅ [SHARE] Clé de partage trouvée:', recipientWallet);

        // 4. Extraction clé publique
        console.log('🔑 [SHARE] Extraction clé publique du certificat destinataire...');
        const recipientPublicKeyJWK = await ShareController.extractPublicKeyFromCert(recipientWallet.cert_pem);
        console.log('✅ [SHARE] Clé publique extraite');

        // 5. Chiffrement pour le destinataire
        console.log('🔒 [SHARE] Chiffrement clé AES avec clé publique du destinataire...');
        const encryptedAesKeyForRecipient = await ShareController.encryptWithPublicKey(
            decryptedAesKey,
            recipientPublicKeyJWK
        );
        console.log(`✅ [SHARE] Clé AES chiffrée pour destinataire (${encryptedAesKeyForRecipient.length} bytes)`);

        // =============================================
        // STOCKER LA CLÉ POUR LE DESTINATAIRE et récupérer son ID
        // =============================================
        console.log('💾 [SHARE] Insertion de la clé pour le destinataire...');
        const recipientKeyResult = await client.query(
            `INSERT INTO filekeys (file_id, user_id, encrypted_key, key_type, active)
             VALUES ($1, $2, $3, 'sharing', false)
             RETURNING id`,
            [fileId, recipient.id, encryptedAesKeyForRecipient]
        );
        const recipientFileKeyId = recipientKeyResult.rows[0].id;
        console.log(`✅ Clé destinataire insérée avec ID: ${recipientFileKeyId} (active = false)`);

        // =============================================
        // GESTION DE LA CLÉ PROPRIÉTAIRE
        // =============================================
        let ownerFileKeyId = null;

        if (reencryptedAesKey) {
            console.log('🔁 [SHARE] Utilisation clé rechiffrée fournie');

            // Supprimer l'ancienne clé personnelle
            await client.query(
                `DELETE FROM filekeys WHERE file_id = $1 AND user_id = $2 AND key_type = 'personal'`,
                [fileId, ownerId]
            );
            console.log('🗑️ Ancienne clé personnelle supprimée');

            // Insérer la nouvelle clé sharing et récupérer son ID
            const ownerKeyResult = await client.query(
                `INSERT INTO filekeys (file_id, user_id, encrypted_key, key_type, active)
                 VALUES ($1, $2, $3, 'sharing', false)
                 RETURNING id`,
                [fileId, ownerId, reencryptedAesKey]
            );
            ownerFileKeyId = ownerKeyResult.rows[0].id;
            console.log(`💾 Nouvelle clé sharing insérée avec ID: ${ownerFileKeyId} (active = false)`);

        } else {
            console.log('⚠️ [SHARE] Fallback: rechiffrement avec MA clé');

            const ownerShareKey = await client.query(
                `SELECT w.wallet_account_id, c.cert_pem
                 FROM wallet_accounts w
                 JOIN client_certificates c ON c.fingerprint_sha256 = w.certificate_fingerprint
                 WHERE w.user_id = $1 AND w.account_type = 'sharing'`,
                [ownerId]
            );

            console.log(`📊 [DB] Clé partage owner: ${ownerShareKey.rowCount}`);

            if (ownerShareKey.rows.length > 0) {
                const ownerPublicKeyJWK = await ShareController.extractPublicKeyFromCert(ownerShareKey.rows[0].cert_pem);
                const encryptedAesKeyForOwner = await ShareController.encryptWithPublicKey(
                    decryptedAesKey,
                    ownerPublicKeyJWK
                );

                console.log('🔒 Clé rechiffrée pour owner');

                // Supprimer l'ancienne clé personnelle
                await client.query(
                    `DELETE FROM filekeys WHERE file_id = $1 AND user_id = $2 AND key_type = 'personal'`,
                    [fileId, ownerId]
                );

                // Insérer la nouvelle clé sharing et récupérer son ID
                const ownerKeyResult = await client.query(
                    `INSERT INTO filekeys (file_id, user_id, encrypted_key, key_type, active)
                     VALUES ($1, $2, $3, 'sharing', false)
                     RETURNING id`,
                    [fileId, ownerId, encryptedAesKeyForOwner]
                );
                ownerFileKeyId = ownerKeyResult.rows[0].id;
                console.log(`💾 Clé owner insérée avec ID: ${ownerFileKeyId} (active = false)`);
            }
        }

        // =============================================
        // CRÉATION DU TOKEN AVEC LES IDS DES FILEKEYS
        // =============================================
        const shareToken = crypto.randomBytes(32).toString('hex');
        
        // Encoder les IDs dans le token ou les passer comme paramètres
        // Dans shareFile, crée un lien direct vers le backend
const shareLink = `http://localhost:5173/share/accept?token=${shareToken}&ownerKeyId=${ownerFileKeyId}&recipientKeyId=${recipientFileKeyId}&fileId=${fileId}`;      console.log('🎟️ [SHARE] Token généré:', shareToken);
        console.log('🆔 [SHARE] ownerFileKeyId:', ownerFileKeyId);
        console.log('🆔 [SHARE] recipientFileKeyId:', recipientFileKeyId);
        console.log('🔗 Lien de partage:', shareLink);

     
        // Envoyer l'email
        console.log('📧 [SHARE] Préparation email...');

        try {
            await sendShareFileEmail(
                recipientEmail,
                file.filename,
                req.user.email,
                shareLink
            );
            console.log('✅ [SHARE] Email envoyé avec succès');
        } catch (emailError) {
            console.error('⚠️ [SHARE] Erreur email:', emailError.message);
        }

        await client.query('COMMIT');
        console.log('✅ Transaction COMMIT');

        console.log('🎉 [SHARE] SUCCESS COMPLET');

        res.json({
            success: true,
            message: `Fichier partagé avec ${recipientEmail}`,
            shareToken: shareToken,
            ownerFileKeyId: ownerFileKeyId,
            recipientFileKeyId: recipientFileKeyId
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ [SHARE] ROLLBACK');
        console.error('Erreur:', error.message);
        console.error('Stack:', error.stack);

        res.status(500).json({
            success: false,
            message: error.message
        });
    } finally {
        client.release();
        console.log('🔌 Client DB libéré');
        console.log('🔚 [SHARE] ====== FIN PARTAGE FICHIER ======\n');
    }
}


// ==================== ACCEPTER UN PARTAGE ====================
// Version modifiée de acceptShare sans shared_files
// static async acceptShare(req, res) {
//     console.log('\n✅ [ACCEPT_SHARE] ====== ACCEPTATION PARTAGE ======');
//     console.log('🔗 recipientKeyId:', req.query.recipientKeyId);
//     console.log('🔗 ownerKeyId:', req.query.ownerKeyId);
//     console.log('👤 User ID:', req.user?.userId);

//     const client = await pool.connect();

//     try {
//         const { recipientKeyId, ownerKeyId } = req.query;
//         const userId = req.user.userId;

//         if (!recipientKeyId) {
//             return res.status(400).json({
//                 success: false,
//                 message: "recipientKeyId requis"
//             });
//         }

//         await client.query('BEGIN');

//         // 1. Activer la clé du destinataire (SIMPLE)
//         console.log(`✅ Activation clé destinataire ${recipientKeyId} pour user ${userId}`);
//         await client.query(
//             `UPDATE filekeys SET active = true WHERE id = $1 AND user_id = $2`,
//             [recipientKeyId, userId]
//         );

//         // 2. Activer la clé du propriétaire si fournie (SIMPLE)
//         if (ownerKeyId && ownerKeyId !== 'null' && ownerKeyId !== 'undefined') {
//             console.log(`✅ Activation clé propriétaire ${ownerKeyId}`);
//             await client.query(
//                 `UPDATE filekeys SET active = true WHERE id = $1`,
//                 [ownerKeyId]
//             );
//         }

//         await client.query('COMMIT');

//         console.log('✅ SUCCÈS - Clés activées !');
//         res.json({
//             success: true,
//             message: "Partage accepté avec succès"
//         });

//     } catch (error) {
//         await client.query('ROLLBACK');
//         console.error('❌ Erreur:', error.message);
//         res.status(500).json({
//             success: false,
//             message: error.message
//         });
//     } finally {
//         client.release();
//     }
// }

static async acceptShare(req, res) {
    console.log('\n' + '='.repeat(60));
    console.log('✅ [ACCEPT_SHARE] ====== ACCEPTATION PARTAGE ======');
    console.log('='.repeat(60));
    console.log(`📅 Date: ${new Date().toISOString()}`);
    console.log(`🔗 recipientKeyId: ${req.query.recipientKeyId}`);
    console.log(`🔗 ownerKeyId: ${req.query.ownerKeyId}`);
    console.log(`👤 User ID: ${req.user?.userId}`);
    console.log(`📧 User Email: ${req.user?.email}`);
    console.log('');

    const client = await pool.connect();
    console.log('🔌 [DB] Client connecté avec succès');

    try {
        const { recipientKeyId, ownerKeyId } = req.query;
        const userId = req.user.userId;

        // Vérification paramètres
        console.log('📝 [STEP 1] Vérification des paramètres...');
        if (!recipientKeyId) {
            console.log('❌ [ERREUR] recipientKeyId manquant');
            return res.status(400).json({
                success: false,
                message: "recipientKeyId requis"
            });
        }
        console.log('✅ recipientKeyId présent:', recipientKeyId);
        console.log('');

        // Début transaction
        console.log('🔓 [STEP 2] Début de la transaction...');
        await client.query('BEGIN');
        console.log('✅ Transaction démarrée');
        console.log('');

        // 1. Récupérer le file_id depuis la clé destinataire
        console.log('🔍 [STEP 3] Récupération des infos de la clé destinataire...');
        console.log(`   - Requête SQL: SELECT file_id FROM filekeys WHERE id = ${recipientKeyId}`);
        
        const keyInfo = await client.query(
            `SELECT file_id, user_id, key_type, active FROM filekeys WHERE id = $1`,
            [recipientKeyId]
        );
        
        console.log(`   - Résultat: ${keyInfo.rows.length} ligne(s) trouvée(s)`);
        
        if (keyInfo.rows.length === 0) {
            console.log('❌ [ERREUR] Clé non trouvée dans la base');
            await client.query('ROLLBACK');
            console.log('↩️ Rollback effectué');
            return res.status(404).json({
                success: false,
                message: "Clé non trouvée"
            });
        }
        
        const fileId = keyInfo.rows[0].file_id;
        const keyUserId = keyInfo.rows[0].user_id;
        const keyType = keyInfo.rows[0].key_type;
        const keyActive = keyInfo.rows[0].active;
        
        console.log(`   ✅ Infos récupérées:`);
        console.log(`      - file_id: ${fileId}`);
        console.log(`      - user_id (propriétaire clé): ${keyUserId}`);
        console.log(`      - key_type: ${keyType}`);
        console.log(`      - active: ${keyActive}`);
        console.log('');

        // 2. Activer la clé du destinataire
        console.log('🔑 [STEP 4] Activation de la clé du destinataire...');
        console.log(`   - Target: id=${recipientKeyId}, user_id=${userId}`);
        console.log(`   - Requête SQL: UPDATE filekeys SET active = true, key_type = 'shared' WHERE id = ${recipientKeyId} AND user_id = ${userId}`);
        
        const recipientUpdateResult = await client.query(
            `UPDATE filekeys SET active = true, key_type = 'shared' 
             WHERE id = $1 AND user_id = $2
             RETURNING id, active`,
            [recipientKeyId, userId]
        );
        
        if (recipientUpdateResult.rows.length > 0) {
            console.log(`   ✅ Clé destinataire activée: ID=${recipientUpdateResult.rows[0].id}, active=${recipientUpdateResult.rows[0].active}`);
        } else {
            console.log(`   ⚠️ Aucune ligne mise à jour (clé n'appartient pas à l'utilisateur ou n'existe pas)`);
        }
        console.log('');

        // 3. Activer TOUTES les clés sharing pour ce fichier
        console.log('🔑 [STEP 5] Activation de toutes les clés sharing pour le fichier...');
        console.log(`   - file_id cible: ${fileId}`);
        console.log(`   - Requête SQL: UPDATE filekeys SET active = true WHERE file_id = ${fileId} AND key_type = 'sharing'`);
        
        // D'abord, voir combien de clés vont être affectées
        const countResult = await client.query(
            `SELECT COUNT(*) as count FROM filekeys 
             WHERE file_id = $1 AND key_type = 'sharing'`,
            [fileId]
        );
        console.log(`   - Nombre de clés sharing trouvées pour ce fichier: ${countResult.rows[0].count}`);
        
        // Exécuter la mise à jour
        const updateResult = await client.query(
            `UPDATE filekeys SET active = true 
             WHERE file_id = $1 AND key_type = 'sharing'
             RETURNING id, user_id`,
            [fileId]
        );
        
        console.log(`   ✅ ${updateResult.rows.length} clé(s) activée(s):`);
        updateResult.rows.forEach((row, index) => {
            console.log(`      ${index + 1}. ID=${row.id}, user_id=${row.user_id}`);
        });
        console.log('');

        // Vérification post-activation
        console.log('📊 [STEP 6] Vérification post-activation...');
        const verificationResult = await client.query(
            `SELECT id, user_id, key_type, active 
             FROM filekeys 
             WHERE file_id = $1 AND key_type = 'sharing'
             ORDER BY user_id`,
            [fileId]
        );
        
        console.log(`   État des clés après activation:`);
        verificationResult.rows.forEach((row, index) => {
            console.log(`      ${index + 1}. ID=${row.id}, user_id=${row.user_id}, type=${row.key_type}, active=${row.active}`);
        });
        console.log('');

        // Commit transaction
        console.log('💾 [STEP 7] Validation de la transaction...');
        await client.query('COMMIT');
        console.log('✅ Transaction COMMIT avec succès');
        console.log('');

        console.log('🎉 [SUCCÈS] Partage accepté avec succès !');
        console.log(`   - Fichier ID: ${fileId}`);
        console.log(`   - Destinataire ID: ${userId}`);
        console.log(`   - Clés activées: ${updateResult.rows.length}`);
        console.log('='.repeat(60) + '\n');
        
        res.json({
            success: true,
            message: "Partage accepté avec succès",
            data: {
                fileId: fileId,
                keysActivated: updateResult.rows.length,
                recipientKeyActivated: recipientUpdateResult.rows.length > 0
            }
        });

    } catch (error) {
        console.log('');
        console.log('💥 [ERREUR] Exception capturée !');
        console.log(`   - Message: ${error.message}`);
        console.log(`   - Stack: ${error.stack}`);
        console.log('');
        
        console.log('↩️ [ROLLBACK] Annulation de la transaction...');
        await client.query('ROLLBACK');
        console.log('✅ Rollback effectué');
        
        console.log('❌ Envoi de la réponse d\'erreur');
        res.status(500).json({
            success: false,
            message: error.message
        });
    } finally {
        console.log('');
        console.log('🔌 [DB] Libération du client...');
        client.release();
        console.log('✅ Client DB libéré');
        console.log('🔚 [ACCEPT_SHARE] ====== FIN ACCEPTATION PARTAGE ======');
        console.log('='.repeat(60) + '\n');
    }
}

  // ==================== RÉCUPÉRER LES FICHIERS PARTAGÉS AVEC MOI ====================
  static async getSharedWithMe(req, res) {
    console.log('\n📥 [SHARED_WITH_ME] ====== RÉCUPÉRATION FICHIERS PARTAGÉS ======');
    console.log('👤 User ID:', req.user?.userId);

    try {
      const userId = req.user.userId;

      const result = await pool.query(
        `SELECT s.id, s.share_token, s.status, s.created_at, s.accepted_at,
                f.id as file_id, f.filename, f.size, f.created_at as file_created_at,
                u.email as shared_by_email, u.id as shared_by_id
         FROM shared_files s
         JOIN files f ON s.file_id = f.id
         JOIN users u ON s.owner_id = u.id
         WHERE s.shared_with_id = $1 AND s.status = 'accepted'
         ORDER BY s.accepted_at DESC`,
        [userId]
      );

      console.log(`✅ [SHARED_WITH_ME] ${result.rows.length} fichier(s) partagé(s) trouvé(s)`);
      res.json({
        success: true,
        data: result.rows
      });

    } catch (error) {
      console.error('❌ [SHARED_WITH_ME] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

// ==================== FICHIERS PARTAGÉS AVEC MOI (active = true) ====================
static async getSharedWithMe(req, res) {
    console.log('\n📥 [SHARED_WITH_ME] ====== DÉBUT ======');
    console.log('👤 User ID:', req.user?.userId);

    try {
        const userId = req.user.userId;

        // Récupérer tous les fichiers partagés avec moi ACCEPTÉS (active = true)
        const result = await pool.query(
            `SELECT 
                fk.id as filekey_id,
                fk.file_id,
                fk.encrypted_key,
                f.created_at as shared_at,
                f.filename,
                f.size,
                f.mime_type,
                u.id as owner_id,
                u.email as owner_email
             FROM filekeys fk
             JOIN files f ON fk.file_id = f.id
             JOIN users u ON f.owner_id = u.id
             WHERE fk.user_id = $1 
               AND fk.key_type = 'sharing' 
               AND fk.active = true
             ORDER BY f.created_at DESC`,
            [userId]
        );

        console.log(`✅ ${result.rows.length} fichier(s) partagé(s) avec moi (acceptés)`);
        
        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

// ==================== PERSONNES AVEC QUI J'AI PARTAGÉ (active = true aussi) ====================
static async getPeopleISharedWith(req, res) {
    console.log('\n📤 [SHARED_BY_ME] ====== DÉBUT ======');
    console.log('👤 User ID:', req.user?.userId);

    try {
        const userId = req.user.userId;

        // Récupérer tous les fichiers que j'ai partagés ET ACCEPTÉS
        const result = await pool.query(
            `SELECT 
                f.id as file_id,
                f.filename,
                f.size,
                f.created_at as file_created_at,
                fk.id as filekey_id,
                fk.active as is_accepted,
                u.id as shared_with_id,
                u.email as shared_with_email,
                u.is_active as user_active
             FROM files f
             JOIN filekeys fk ON f.id = fk.file_id
             JOIN users u ON fk.user_id = u.id
             WHERE f.owner_id = $1 
               AND fk.key_type = 'sharing'
               AND fk.active = true
               AND fk.user_id != $1
             ORDER BY f.created_at DESC`,
            [userId]
        );

        // Grouper par fichier pour avoir la liste des personnes
        const filesWithShares = {};
        result.rows.forEach(row => {
            if (!filesWithShares[row.file_id]) {
                filesWithShares[row.file_id] = {
                    file_id: row.file_id,
                    filename: row.filename,
                    size: row.size,
                    file_created_at: row.file_created_at,
                    shared_with: []
                };
            }
            filesWithShares[row.file_id].shared_with.push({
                user_id: row.shared_with_id,
                email: row.shared_with_email,
                is_accepted: row.is_accepted
            });
        });

        console.log(`✅ ${result.rows.length} partage(s) accepté(s) trouvé(s)`);
        
        res.json({
            success: true,
            data: result.rows,
            groupedByFile: Object.values(filesWithShares)
        });

    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

// ==================== VERSION SIMPLIFIÉE - JUSTE LES EMAILS (active = true) ====================
static async getSharedByMeSimple(req, res) {
    console.log('\n📤 [SHARED_BY_ME_SIMPLE] ====== DÉBUT ======');
    
    try {
        const userId = req.user.userId;

        // Version simplifiée: uniquement les partages ACCEPTÉS
        const result = await pool.query(
            `SELECT DISTINCT 
                u.id as user_id,
                u.email,
                COUNT(DISTINCT fk.file_id) as files_count,
                MAX(f.created_at) as last_share_date
             FROM filekeys fk
             JOIN users u ON fk.user_id = u.id
             JOIN files f ON fk.file_id = f.id
             WHERE f.owner_id = $1 
               AND fk.key_type = 'sharing'
               AND fk.active = true
               AND fk.user_id != $1
             GROUP BY u.id, u.email
             ORDER BY last_share_date DESC`,
            [userId]
        );

        console.log(`✅ ${result.rows.length} personne(s) avec qui j'ai partagé (acceptés)`);
        
        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('❌ Erreur:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}
  // ==================== RÉVOQUER UN PARTAGE ====================
  static async revokeShare(req, res) {
    console.log('\n🚫 [REVOKE_SHARE] ====== RÉVOCATION PARTAGE ======');
    console.log('📦 Share ID:', req.params.shareId);
    console.log('👤 User ID:', req.user?.userId);

    try {
      const { shareId } = req.params;
      const userId = req.user.userId;

      const result = await pool.query(
        `UPDATE shared_files 
         SET status = 'revoked', revoked_at = NOW()
         WHERE id = $1 AND owner_id = $2
         RETURNING id`,
        [shareId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Partage non trouvé"
        });
      }

      console.log(`✅ [REVOKE_SHARE] Partage ${shareId} révoqué`);
      res.json({
        success: true,
        message: "Partage révoqué avec succès"
      });

    } catch (error) {
      console.error('❌ [REVOKE_SHARE] Erreur:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // ==================== UTILITAIRES ====================

  static async extractPublicKeyFromCert(certPem) {
    console.log('🔧 [EXTRACT] Extraction clé publique du certificat...');
    try {
      const cert = forge.pki.certificateFromPem(certPem);
      const publicKey = cert.publicKey;
      
      const n = publicKey.n.toString(16);
      const e = publicKey.e.toString(16);
      
      const nBase64 = Buffer.from(n, 'hex').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const eBase64 = Buffer.from(e, 'hex').toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      const jwk = {
        kty: 'RSA',
        n: nBase64,
        e: eBase64,
        alg: 'RS256',
        use: 'sig'
      };
      
      console.log('✅ [EXTRACT] JWK extrait');
      return jwk;
    } catch (error) {
      console.error('❌ [EXTRACT] Erreur:', error);
      throw error;
    }
  }

  static async encryptWithPublicKey(data, publicKeyJWK) {
    console.log('🔒 [ENCRYPT] Chiffrement avec clé publique...');
    try {
      // Convertir la clé en format approprié
      let keyData = data;
      
      // Si data est une string base64, la convertir en buffer
      if (typeof data === 'string') {
        keyData = Buffer.from(data, 'base64');
      }
      
      // Convertir JWK en forge public key
      const nBase64 = publicKeyJWK.n.replace(/-/g, '+').replace(/_/g, '/');
      const eBase64 = publicKeyJWK.e.replace(/-/g, '+').replace(/_/g, '/');
      
      const n = forge.util.createBuffer(forge.util.decode64(nBase64));
      const e = forge.util.createBuffer(forge.util.decode64(eBase64));
      
      const publicKey = forge.pki.setRsaPublicKey(
        new forge.jsbn.BigInteger(n.toHex(), 16),
        new forge.jsbn.BigInteger(e.toHex(), 16)
      );
      
      // Chiffrer les données
      const encrypted = publicKey.encrypt(keyData.toString(), 'RSA-OAEP');
      const encryptedBase64 = forge.util.encode64(encrypted);
      
      console.log('✅ [ENCRYPT] Chiffrement réussi');
      return encryptedBase64;
    } catch (error) {
      console.error('❌ [ENCRYPT] Erreur:', error);
      throw error;
    }
  
  }



  // ==================== ACCEPTER UN PARTAGE ====================






  


}

module.exports = ShareController;