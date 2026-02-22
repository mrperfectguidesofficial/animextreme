import { auth, db } from '../api/firebase.js';
import { collection, doc, onSnapshot, getDocs, updateDoc, arrayUnion, arrayRemove, query, orderBy, limit, runTransaction, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { closeModal, openModal, uploadImage } from '../api/utils.js';

let unsubscribeProfile = null;

export function loadProfilePage(targetUid) {
    const uid = targetUid || window.currentUser.uid;
    const isMe = uid === window.currentUser.uid;
    
    if(unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
    }
    
    const docRef = doc(db, "users", uid);
    unsubscribeProfile = onSnapshot(docRef, (snap) => {
        document.getElementById('editProfileBtn').classList.toggle('hidden', !isMe);
        document.getElementById('profileActions').classList.toggle('hidden', !isMe);
        document.getElementById('editBannerBtn').classList.toggle('hidden', !isMe);
        
        const followBtn = document.getElementById('followUserBtn');
        const msgBtn = document.getElementById('msgUserBtn');
        
        document.getElementById('reactionArea').classList.remove('hidden');
        
        followBtn.classList.toggle('hidden', isMe);
        msgBtn.classList.toggle('hidden', isMe);
        
        if (snap.exists()) {
            const data = snap.data();
            document.getElementById('username').innerText = data.displayName || data.username || "User";
            
            const badge = document.getElementById('verificationBadge');
            badge.innerHTML = data.isVerified ? '<i class="fa-solid fa-circle-check verified-badge"></i>' : '';

            document.getElementById('profilePic').src = data.avatar || "https://via.placeholder.com/150";
            document.getElementById('customId').innerText = data.customId || "N/A";
            document.getElementById('userBio').innerText = data.bio || "No bio.";
            
            const bannerEl = document.getElementById('profileBanner');
            if(data.banner) {
                bannerEl.style.backgroundImage = `url(${data.banner})`;
            } else {
                bannerEl.style.backgroundImage = 'linear-gradient(135deg, #7c4dff, #2979ff)';
            }
            
            getDocs(collection(db, "users", uid, "watchlist")).then(wSnap => {
                document.getElementById('animeCount').innerText = wSnap.size;
            });
            
            const previewContainer = document.getElementById('watchlistPreview');
            previewContainer.innerHTML = '';
            const qPreview = query(collection(db, "users", uid, "watchlist"), orderBy("addedAt", "desc"), limit(6));
            getDocs(qPreview).then(wSnap => {
                wSnap.forEach(doc => {
                    const anime = doc.data();
                    const div = document.createElement('div');
                    div.className = 'preview-item';
                    div.innerHTML = `<img src="${anime.image}"><div class="preview-overlay">${anime.status}</div>`;
                    div.onclick = () => window.navigateTo('details', { id: anime.id });
                    previewContainer.appendChild(div);
                });
            });

            document.getElementById('followerCount').innerText = (data.followers || []).length;
            document.getElementById('followingCount').innerText = (data.following || []).length;

            const likes = data.likes || [];
            const dislikes = data.dislikes || [];
            document.getElementById('likeCount').innerText = likes.length;
            document.getElementById('dislikeCount').innerText = dislikes.length;
            
            const likeBtn = document.getElementById('likeBtn');
            const dislikeBtn = document.getElementById('dislikeBtn');
            
            if(likes.includes(window.currentUser.uid)) {
                likeBtn.style.color = '#7c4dff';
                likeBtn.style.background = 'rgba(124, 77, 255, 0.1)';
                likeBtn.style.border = '1px solid #7c4dff';
            } else {
                likeBtn.style.color = '#aaa';
                likeBtn.style.background = 'white';
                likeBtn.style.border = '1px solid #eee';
            }
            
            if(dislikes.includes(window.currentUser.uid)) {
                dislikeBtn.style.color = '#ff5252';
                dislikeBtn.style.background = 'rgba(255, 82, 82, 0.1)';
                dislikeBtn.style.border = '1px solid #ff5252';
            } else {
                dislikeBtn.style.color = '#aaa';
                dislikeBtn.style.background = 'white';
                dislikeBtn.style.border = '1px solid #eee';
            }

            if(isMe) {
                document.getElementById('editName').value = data.displayName || data.username || "";
                document.getElementById('editBio').value = data.bio || "";
            }

            if(!isMe) {
                const amFollowing = data.followers?.includes(window.currentUser.uid);
                followBtn.innerText = amFollowing ? "Unfollow" : "Follow";
                
                const newFollowBtn = followBtn.cloneNode(true);
                followBtn.parentNode.replaceChild(newFollowBtn, followBtn);
                
                newFollowBtn.onclick = () => {
                    const isNowFollowing = newFollowBtn.innerText === "Follow";
                    newFollowBtn.innerText = isNowFollowing ? "Unfollow" : "Follow";
                    toggleFollow(uid, !isNowFollowing); 
                };

                msgBtn.onclick = () => initiatePrivateChat(uid, data.displayName || data.username, data.avatar, data.customId);
                
                likeBtn.onclick = () => {
                    if(likes.includes(window.currentUser.uid)) {
                        likeBtn.style.color = '#aaa';
                        likeBtn.style.background = 'white';
                        likeBtn.style.border = '1px solid #eee';
                        document.getElementById('likeCount').innerText = likes.length - 1;
                    } else {
                        likeBtn.style.color = '#7c4dff';
                        likeBtn.style.background = 'rgba(124, 77, 255, 0.1)';
                        likeBtn.style.border = '1px solid #7c4dff';
                        document.getElementById('likeCount').innerText = likes.length + 1;
                        if(dislikes.includes(window.currentUser.uid)) {
                            dislikeBtn.style.color = '#aaa';
                            dislikeBtn.style.background = 'white';
                            dislikeBtn.style.border = '1px solid #eee';
                            document.getElementById('dislikeCount').innerText = dislikes.length - 1;
                        }
                    }
                    toggleReaction(uid, 'like');
                };

                dislikeBtn.onclick = () => {
                    if(dislikes.includes(window.currentUser.uid)) {
                        dislikeBtn.style.color = '#aaa';
                        dislikeBtn.style.background = 'white';
                        dislikeBtn.style.border = '1px solid #eee';
                        document.getElementById('dislikeCount').innerText = dislikes.length - 1;
                    } else {
                        dislikeBtn.style.color = '#ff5252';
                        dislikeBtn.style.background = 'rgba(255, 82, 82, 0.1)';
                        dislikeBtn.style.border = '1px solid #ff5252';
                        document.getElementById('dislikeCount').innerText = dislikes.length + 1;
                        if(likes.includes(window.currentUser.uid)) {
                            likeBtn.style.color = '#aaa';
                            likeBtn.style.background = 'white';
                            likeBtn.style.border = '1px solid #eee';
                            document.getElementById('likeCount').innerText = likes.length - 1;
                        }
                    }
                    toggleReaction(uid, 'dislike');
                };
            } else {
                likeBtn.onclick = null;
                dislikeBtn.onclick = null;
            }
        }
    });
}

async function toggleReaction(targetUid, type) {
    const targetRef = doc(db, "users", targetUid);
    const myUid = window.currentUser.uid;
    
    await runTransaction(db, async (t) => {
        const docSnap = await t.get(targetRef);
        const data = docSnap.data();
        let likes = data.likes || [];
        let dislikes = data.dislikes || [];
        
        if (type === 'like') {
            if (likes.includes(myUid)) {
                likes = likes.filter(id => id !== myUid);
            } else {
                likes.push(myUid);
                dislikes = dislikes.filter(id => id !== myUid);
            }
        } else {
            if (dislikes.includes(myUid)) {
                dislikes = dislikes.filter(id => id !== myUid);
            } else {
                dislikes.push(myUid);
                likes = likes.filter(id => id !== myUid);
            }
        }
        
        t.update(targetRef, { likes: likes, dislikes: dislikes });
    });
}

export async function uploadBanner() {
    const file = document.getElementById('bannerUpload').files[0];
    if(!file) return;
    
    document.getElementById('profileBanner').style.opacity = '0.5';
    
    try {
        const url = await uploadImage(file);
        await updateDoc(doc(db, "users", window.currentUser.uid), { banner: url });
        document.getElementById('profileBanner').style.opacity = '1';
    } catch(e) { 
        alert("Upload failed");
        document.getElementById('profileBanner').style.opacity = '1';
    }
}

async function initiatePrivateChat(targetUid, targetName, targetAvatar, targetCustomId) {
    const q = query(collection(db, "chats"), where("participants", "array-contains", window.currentUser.uid));
    const snap = await getDocs(q);
    let existingChatId = null;
    
    snap.forEach(doc => {
        const data = doc.data();
        if(data.participants.includes(targetUid) && data.participants.length === 2) {
            existingChatId = doc.id;
        }
    });

    if(existingChatId) {
        window.openChat(existingChatId, targetName, targetAvatar, targetCustomId, 'private', targetUid);
    } else {
        const newChatRef = await addDoc(collection(db, "chats"), {
            participants: [window.currentUser.uid, targetUid],
            userData: [
                { uid: window.currentUser.uid, name: window.currentUser.displayName || "User", avatar: window.currentUser.photoURL || "", customId: "ME" },
                { uid: targetUid, name: targetName, avatar: targetAvatar, customId: targetCustomId }
            ],
            lastMessage: "Chat started",
            lastUpdated: serverTimestamp()
        });
        window.openChat(newChatRef.id, targetName, targetAvatar, targetCustomId, 'private', targetUid);
    }
    window.navigateTo('chat');
}

async function toggleFollow(targetUid, isFollowing) {
    const myRef = doc(db, "users", window.currentUser.uid);
    const targetRef = doc(db, "users", targetUid);
    
    if(isFollowing) {
        await updateDoc(myRef, { following: arrayRemove(targetUid) });
        await updateDoc(targetRef, { followers: arrayRemove(window.currentUser.uid) });
    } else {
        await updateDoc(myRef, { following: arrayUnion(targetUid) });
        await updateDoc(targetRef, { followers: arrayUnion(window.currentUser.uid) });
    }
}

export function openEditModal() {
    openModal('editProfileModal');
}

export async function saveProfile() {
    const newName = document.getElementById('editName').value.trim();
    const newBio = document.getElementById('editBio').value.trim();
    const file = document.getElementById('editAvatarFile').files[0];
    if(!newName) return alert("Name required");
    const btn = document.getElementById('saveProfileBtn');
    btn.innerText = "Saving...";
    try {
        const currentDoc = await getDoc(doc(db, "users", window.currentUser.uid));
        let avatarUrl = currentDoc.data().avatar;
        if(file) avatarUrl = await uploadImage(file);
        await updateDoc(doc(db, "users", window.currentUser.uid), {
            displayName: newName,
            bio: newBio,
            avatar: avatarUrl
        });
        closeModal('editProfileModal');
    } catch (e) {
        alert("Error: " + e.message);
    } 
    btn.innerText = "Save Changes";
}

export function copyId() {
    const text = document.getElementById('customId').innerText;
    navigator.clipboard.writeText(text).then(() => alert("ID Copied"));
}

// Attach to window
window.loadProfilePage = loadProfilePage;
window.uploadBanner = uploadBanner;
window.openEditModal = openEditModal;
window.saveProfile = saveProfile;
window.copyId = copyId;