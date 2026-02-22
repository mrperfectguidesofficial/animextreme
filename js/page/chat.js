import { auth, db } from '../api/firebase.js';
import { collection, query, where, getDocs, getDoc, doc, onSnapshot, addDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, runTransaction, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { closeModal, openModal, uploadImage } from '../api/utils.js';

let unsubscribeChats = null;
let unsubscribeGroups = null;
let unsubscribeMsgs = null;
let partnerPresenceUnsub = null;
let activeChatId = null;
let activeChatType = 'private';
let activeChatTargetUid = null;

export function loadChatPage() {
    loadPrivateChats();
    loadGroups();
}

function loadPrivateChats() {
    const list = document.getElementById('privateList');
    if (unsubscribeChats) unsubscribeChats();
    const q = query(collection(db,"chats"), where("participants","array-contains",window.currentUser.uid));
    unsubscribeChats = onSnapshot(q, snap => {
        list.innerHTML='';
        let chats=[]; snap.forEach(d=>chats.push({id:d.id,...d.data()}));
        chats.sort((a,b)=>(b.lastUpdated?.seconds||0)-(a.lastUpdated?.seconds||0));
        chats.forEach(d => {
            const o = d.userData.find(u=>u.uid!==window.currentUser.uid)||{name:"User"};
            const div = document.createElement('div'); div.className='chat-item';
            div.innerHTML = `<img src="${o.avatar||'https://via.placeholder.com/50'}" class="chat-avatar"><div style="flex:1;"><div style="font-weight:700; color:var(--text-heading);">${o.name}</div><div style="font-size:12px; color:var(--text-muted);">${d.lastMessage||'Start chat'}</div></div>`;
            div.addEventListener('click', () => openChat(d.id, o.name, o.avatar, o.customId, 'private', o.uid));
            list.appendChild(div);
        });
    });
}

function loadGroups() {
    const list = document.getElementById('groupsList');
    if (unsubscribeGroups) unsubscribeGroups();
    const q = query(collection(db, "groups"), where("members", "array-contains", window.currentUser.uid));
    unsubscribeGroups = onSnapshot(q, snap => {
        list.innerHTML='';
        snap.forEach(docSnap => {
            const g = docSnap.data();
            const div = document.createElement('div'); div.className='group-item';
            div.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;width:100%;">
                    <img src="${g.photo}" style="width:45px;height:45px;border-radius:50%;cursor:pointer;border:2px solid white; box-shadow:0 3px 6px rgba(0,0,0,0.1);" class="group-icon-click" data-gid="${docSnap.id}">
                    <div style="flex:1;cursor:pointer;" class="group-info-click" data-gid="${docSnap.id}" data-name="${g.name}" data-photo="${g.photo}" data-user="${g.username}">
                        <h4 style="color:var(--text-heading);margin:0;font-size:15px;">${g.name}</h4>
                        <span style="font-size:11px;color:var(--text-muted);font-weight:500;">${g.members.length} Members</span>
                    </div>
                    <i class="fa-solid fa-chevron-right" style="color:#ccc;"></i>
                </div>`;
            
            const icon = div.querySelector('.group-icon-click');
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                activeChatId = docSnap.id;
                openGroupSettings();
            });

            const info = div.querySelector('.group-info-click');
            info.addEventListener('click', () => {
                openChat(docSnap.id, g.name, g.photo, g.username, 'group');
            });

            list.appendChild(div);
        });
    });
}

export function handleFab() {
    const currentTab = document.querySelector('.chat-tab.active').id === 'tab-private' ? 'private' : 'groups';
    if(currentTab === 'private') openModal('searchModal');
    else openModal('createGroupModal');
}

export function switchTab(tab) {
    const privTab = document.getElementById('tab-private');
    const grpTab = document.getElementById('tab-groups');
    if(tab === 'private') {
        privTab.classList.add('active'); grpTab.classList.remove('active');
        document.getElementById('privateList').style.display = 'block';
        document.getElementById('groupsList').style.display = 'none';
    } else {
        grpTab.classList.add('active'); privTab.classList.remove('active');
        document.getElementById('privateList').style.display = 'none';
        document.getElementById('groupsList').style.display = 'block';
    }
}

export async function searchUser() {
    const term = document.getElementById('searchIdInput').value.trim();
    if(!term) return;

    const userQ = query(collection(db,"users"), where("customId","==",term));
    const userSnap = await getDocs(userQ);
    
    if(!userSnap.empty) {
        const target = userSnap.docs[0].data();
        closeModal('searchModal');
        window.navigateTo('profile', { uid: target.uid });
        return;
    }

    const groupQ = query(collection(db,"groups"), where("username","==",term));
    const groupSnap = await getDocs(groupQ);
    
    if(!groupSnap.empty) {
        const g = groupSnap.docs[0].data();
        const gid = groupSnap.docs[0].id;
        closeModal('searchModal');
        
        if(g.members.includes(window.currentUser.uid)) {
            openChat(gid, g.name, g.photo, g.username, 'group');
        } else if(g.privacy === 'public') {
            if(confirm(`Join public group "${g.name}"?`)) {
                await updateDoc(doc(db,"groups",gid), { members: arrayUnion(window.currentUser.uid) });
                openChat(gid, g.name, g.photo, g.username, 'group');
            }
        } else {
            if(confirm(`Request to join private group "${g.name}"?`)) {
                await updateDoc(doc(db,"groups",gid), { requests: arrayUnion(window.currentUser.uid) });
                alert("Request sent to admin.");
            }
        }
        return;
    }
    alert("Not found");
}

export async function createGroup() {
    const name = document.getElementById('groupNameInput').value.trim();
    let username = document.getElementById('groupUsernameInput').value.trim();
    const bio = document.getElementById('groupBioInput').value.trim();
    const photoFile = document.getElementById('groupPhotoInput').files[0];
    const privacy = document.getElementById('groupPrivacyInput').value;

    if(!name || !username || !photoFile) return alert("Fill all fields");
    if(!username.endsWith('_Group')) username += '_Group';

    const q = query(collection(db, "groups"), where("username", "==", username));
    const snap = await getDocs(q);
    if(!snap.empty) return alert("Group Username taken");

    const btn = document.getElementById('createGroupBtn');
    btn.innerText = "Creating...";
    
    try {
        const photoUrl = await uploadImage(photoFile);
        await addDoc(collection(db, "groups"), {
            name, username, bio, photo: photoUrl, privacy,
            members: [window.currentUser.uid],
            roles: { [window.currentUser.uid]: 'admin' },
            requests: [],
            createdAt: serverTimestamp()
        });
        closeModal('createGroupModal');
        alert("Group Created!");
    } catch(e) {
        alert(e.message);
    }
    btn.innerText = "Create";
}

export function openChat(id, name, img, sub, type, targetUid = null) {
    if(unsubscribeMsgs) unsubscribeMsgs();
    if(partnerPresenceUnsub) { partnerPresenceUnsub(); partnerPresenceUnsub = null; }
    
    activeChatId = id;
    activeChatType = type;
    activeChatTargetUid = targetUid;
    
    document.getElementById('headerName').innerText = name; 
    document.getElementById('headerAvatar').src = img || 'https://via.placeholder.com/50'; 
    
    if(type === 'private' && targetUid) {
        const partnerRef = doc(db, "users", targetUid);
        partnerPresenceUnsub = onSnapshot(partnerRef, (snap) => {
            if(snap.exists()) {
                const data = snap.data();
                const lastLogin = data.lastLogin?.toDate();
                if(lastLogin && (new Date() - lastLogin < 120000)) {
                    document.getElementById('headerSub').innerText = "Online";
                    document.getElementById('headerSub').style.color = "#00e676";
                } else {
                    document.getElementById('headerSub').innerText = `ID: ${sub}`;
                    document.getElementById('headerSub').style.color = "#aaa";
                }
            }
        });
    } else {
        document.getElementById('headerSub').innerText = type === 'group' ? sub : `ID: ${sub}`;
        document.getElementById('headerSub').style.color = "#aaa";
    }

    document.getElementById('chatRoomView').style.transform = 'translateX(0)'; 
    loadMsgs(id, type);
}

export function closeChat() {
    activeChatId = null;
    activeChatTargetUid = null; 
    if(unsubscribeMsgs) unsubscribeMsgs();
    if(partnerPresenceUnsub) { partnerPresenceUnsub(); partnerPresenceUnsub = null; }
    document.getElementById('chatRoomView').style.transform = 'translateX(100%)'; 
}

function loadMsgs(id, type) {
    const el = document.getElementById('messageContainer');
    const q = query(collection(db, type === 'group' ? 'groups' : 'chats', id, "messages"), orderBy("createdAt", "asc"));
    unsubscribeMsgs = onSnapshot(q, snap => {
        el.innerHTML = ''; 
        snap.forEach(d => {
            const m = d.data();
            const msgId = d.id;
            
            if(m.type === 'system') {
                const div = document.createElement('div');
                div.className = 'msg-system';
                div.innerText = m.text;
                el.appendChild(div);
                return;
            }

            const div = document.createElement('div');
            div.className = `msg ${m.senderId === window.currentUser.uid ? 'msg-me' : 'msg-other'}`;
            let nameHtml = type === 'group' && m.senderId !== window.currentUser.uid ? `<div style="font-size:10px; color:var(--primary); font-weight:700;">${m.senderName||'User'}</div>` : '';
            
            let tickHtml = '';
            if(m.senderId === window.currentUser.uid) {
                const isSeen = m.seenBy && m.seenBy.length > 1;
                const tickClass = isSeen ? 'seen' : 'delivered';
                tickHtml = `<span class="msg-tick ${tickClass}"><i class="fa-solid fa-check-double"></i></span>`;
            } else {
                if(!m.seenBy || !m.seenBy.includes(window.currentUser.uid)) {
                    updateDoc(doc(db, type === 'group' ? 'groups' : 'chats', id, "messages", msgId), {
                        seenBy: arrayUnion(window.currentUser.uid)
                    });
                }
            }

            div.innerHTML = `${nameHtml}${m.text} ${tickHtml}`;
            el.appendChild(div);
        });
        el.scrollTop = el.scrollHeight;
    }, (error) => console.log("Chat permission error", error));
}

export async function sendMessage() {
    const inp = document.getElementById('msgInput');
    const txt = inp.value.trim(); if(!txt) return;
    inp.value='';
    const coll = activeChatType === 'group' ? 'groups' : 'chats';
    await addDoc(collection(db, coll, activeChatId, "messages"), { 
        senderId: window.currentUser.uid, 
        senderName: window.currentUser.displayName || "User", 
        text: txt, 
        createdAt: serverTimestamp(),
        seenBy: [window.currentUser.uid],
        type: 'text'
    });
    await updateDoc(doc(db, coll, activeChatId), { lastMessage: txt, lastUpdated: serverTimestamp() });
}

async function sendSystemMessage(groupId, text) {
    await addDoc(collection(db, "groups", groupId, "messages"), {
        text: text,
        type: 'system',
        createdAt: serverTimestamp(),
        seenBy: []
    });
}

export async function openGroupSettings() {
    if(!activeChatId) return;

    const modal = document.getElementById('groupSettingsModal');
    const content = document.getElementById('groupSettingsContent');
    content.innerHTML = '<div class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    openModal('groupSettingsModal');

    try {
        const gRef = doc(db, "groups", activeChatId);
        const gSnap = await getDoc(gRef);
        
        if (!gSnap.exists()) {
            content.innerHTML = '<p class="text-center">Group not found.</p>';
            return;
        }

        const g = gSnap.data();
        const myRole = (g.roles && g.roles[window.currentUser.uid]) ? g.roles[window.currentUser.uid] : 'member';
        const isAdmin = myRole === 'admin';
        const isMod = myRole === 'mod' || isAdmin;

        let html = `<div id="grpViewMode">`;
        
        if(isAdmin) {
            html += `
            <div style="text-align:center; margin-bottom:15px;">
                <img src="${g.photo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin-bottom:8px;border:3px solid white;box-shadow:0 3px 6px rgba(0,0,0,0.1);" onclick="document.getElementById('editGroupPhoto').click()">
                <input type="file" id="editGroupPhoto" hidden onchange="window.updateGroupPhoto(this, '${activeChatId}')">
                <input type="text" id="editGroupName" class="modal-inp" value="${g.name}" style="text-align:center;font-weight:700;margin-bottom:5px;">
                <textarea id="editGroupDesc" class="modal-inp" rows="2" style="font-size:12px;">${g.bio}</textarea>
                <button class="btn-primary" onclick="window.saveGroupInfo('${activeChatId}')" style="width:100%;margin-top:5px;font-size:12px;">Save Info</button>
            </div>`;
        } else {
            html += `
            <div class="text-center" style="margin-bottom:15px;">
                <img src="${g.photo}" style="width:80px;height:80px;border-radius:50%;margin-bottom:10px;object-fit:cover;border:3px solid white;box-shadow:0 3px 6px rgba(0,0,0,0.1);">
                <h4 style="margin-bottom:5px; color:var(--text-heading);">${g.name}</h4>
                <p style="font-size:12px;color:var(--text-muted);">${g.username}</p>
                <p style="font-size:13px;margin:10px 0;color:#555;">${g.bio}</p>
            </div>`;
        }

        if(isAdmin) {
            html += `
            <div style="background:#f9f9f9; padding:12px; border-radius:12px; margin-bottom:15px;">
                <label style="font-size:11px; color:var(--text-muted); font-weight:600;">Privacy</label>
                <select id="setPrivacy" class="modal-inp" style="margin-bottom:8px;" onchange="window.updateGroupSetting('${activeChatId}', 'privacy', this.value)">
                    <option value="public" ${g.privacy === 'public' ? 'selected' : ''}>Public (Auto Join)</option>
                    <option value="private" ${g.privacy === 'private' ? 'selected' : ''}>Private (Approval)</option>
                    <option value="invite" ${g.privacy === 'invite' ? 'selected' : ''}>Invite Only</option>
                </select>
                
                <label style="font-size:11px; color:var(--text-muted); font-weight:600;">Who can send messages?</label>
                <select id="setMsgPerm" class="modal-inp" onchange="window.updateGroupSetting('${activeChatId}', 'msgPerm', this.value)">
                    <option value="everyone" ${g.msgPerm === 'everyone' ? 'selected' : ''}>Everyone</option>
                    <option value="restricted" ${g.msgPerm === 'restricted' ? 'selected' : ''}>Admins & Mods</option>
                    <option value="admin" ${g.msgPerm === 'admin' ? 'selected' : ''}>Admins Only</option>
                </select>
            </div>`;
        }

        if (g.privacy === 'private' && isMod && g.requests && g.requests.length > 0) {
            html += `<h5 style="margin-bottom:8px;">Requests (${g.requests.length})</h5><div style="max-height:100px;overflow-y:auto;margin-bottom:15px;background:#f9f9f9;padding:8px;border-radius:12px;">`;
            for (const reqUid of g.requests) {
                html += `<div style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #eee;font-size:12px;align-items:center;">
                    <span style="font-weight:600;">${reqUid}</span>
                    <div>
                        <button onclick="window.acceptRequest('${activeChatId}','${reqUid}')" style="color:#00e676;background:none;margin-right:8px;font-size:14px;"><i class="fa-solid fa-check"></i></button>
                        <button onclick="window.rejectRequest('${activeChatId}','${reqUid}')" style="color:#ff5252;background:none;font-size:14px;"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>`;
            }
            html += `</div>`;
        }

        html += `<h5 style="margin-bottom:8px;">Members (${g.members.length})</h5>`;
        html += `<div style="max-height:200px;overflow-y:auto;background:#f9f9f9;padding:8px;border-radius:12px;margin-bottom:15px;">`;
        
        g.members.forEach(mUid => {
            const role = (g.roles && g.roles[mUid]) ? g.roles[mUid] : 'member';
            let roleBadge = '';
            if(role === 'admin') roleBadge = '<span class="role-badge role-admin">Admin</span>';
            else if(role === 'mod') roleBadge = '<span class="role-badge role-mod">Mod</span>';
            
            let controls = '';
            if (isAdmin && mUid !== window.currentUser.uid) {
                if(role !== 'admin') controls += `<i class="fa-solid fa-arrow-up" onclick="window.promoteMember('${activeChatId}', '${mUid}')" style="color:#2979ff;cursor:pointer;margin-left:8px;" title="Promote"></i>`;
                if(role !== 'member') controls += `<i class="fa-solid fa-arrow-down" onclick="window.demoteMember('${activeChatId}', '${mUid}')" style="color:#ffab00;cursor:pointer;margin-left:8px;" title="Demote"></i>`;
                controls += `<i class="fa-solid fa-trash" onclick="window.kickMember('${activeChatId}', '${mUid}')" style="color:#ff5252;cursor:pointer;margin-left:8px;" title="Kick"></i>`;
            } else if (isMod && role === 'member' && mUid !== window.currentUser.uid) {
                controls += `<i class="fa-solid fa-trash" onclick="window.kickMember('${activeChatId}', '${mUid}')" style="color:#ff5252;cursor:pointer;margin-left:8px;" title="Kick"></i>`;
            }

            html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #eee;font-size:13px;">
                <div style="display:flex;align-items:center;">
                    <span style="font-weight:600; color:var(--text-heading);">${mUid === window.currentUser.uid ? 'You' : mUid.substr(0,10)+'...'}</span>
                    ${roleBadge}
                </div>
                <div>${controls}</div>
            </div>`;
        });
        html += `</div>`;

        const isMuted = g.notifications && g.notifications[window.currentUser.uid] === 'muted';
        
        html += `
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
            <button onclick="window.toggleGroupMute('${activeChatId}', ${!isMuted})" style="background:${isMuted ? '#fff3e0' : '#f0f0f0'}; color:${isMuted ? '#ff9800' : '#333'}; padding:10px; border-radius:12px; font-size:12px; flex:1; margin-right:5px; font-weight:600; box-shadow:none;">
                <i class="fa-solid ${isMuted ? 'fa-bell-slash' : 'fa-bell'}"></i> ${isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button onclick="alert('Report submitted for review.')" style="background:#ffebee; color:#ff5252; padding:10px; border-radius:12px; font-size:12px; flex:1; margin-left:5px; font-weight:600; box-shadow:none;">
                <i class="fa-solid fa-flag"></i> Report
            </button>
        </div>
        
        <button onclick="window.exitGroup('${activeChatId}')" style="width:100%;padding:12px;background:#ff5252;color:white;border-radius:12px;margin-top:5px;font-weight:700;box-shadow:0 4px 10px rgba(255, 82, 82, 0.3);">Leave Group</button>
        </div>`;

        content.innerHTML = html;

    } catch (e) {
        console.error(e);
        content.innerHTML = '<p class="text-center">Error loading info.</p>';
    }
}

export async function saveGroupInfo(gid) {
    const name = document.getElementById('editGroupName').value;
    const bio = document.getElementById('editGroupDesc').value;
    await updateDoc(doc(db, "groups", gid), { name: name, bio: bio });
    alert("Saved!");
}

export async function updateGroupPhoto(input, gid) {
    const file = input.files[0];
    if(!file) return;
    const url = await uploadImage(file); 
    await updateDoc(doc(db, "groups", gid), { photo: url });
    openGroupSettings();
}

export async function updateGroupSetting(gid, field, value) {
    await updateDoc(doc(db, "groups", gid), { [field]: value });
}

export async function toggleGroupMute(gid, mute) {
    const gRef = doc(db, "groups", gid);
    await updateDoc(gRef, { [`notifications.${window.currentUser.uid}`]: mute ? 'muted' : 'all' });
    openGroupSettings();
}

export async function promoteMember(gid, uid) {
    if(!confirm("Promote this user?")) return;
    const gRef = doc(db, "groups", gid);
    await runTransaction(db, async (t) => {
        const docSnap = await t.get(gRef);
        const g = docSnap.data();
        const currentRole = g.roles[uid] || 'member';
        let newRole = 'mod';
        if(currentRole === 'mod') newRole = 'admin';
        const newRoles = { ...g.roles, [uid]: newRole };
        t.update(gRef, { roles: newRoles });
    });
    await sendSystemMessage(gid, `A member was promoted to ${newRole || 'Mod'}.`);
    openGroupSettings();
}

export async function demoteMember(gid, uid) {
    if(!confirm("Demote this user?")) return;
    const gRef = doc(db, "groups", gid);
    await runTransaction(db, async (t) => {
        const docSnap = await t.get(gRef);
        const g = docSnap.data();
        const newRoles = { ...g.roles, [uid]: 'member' };
        t.update(gRef, { roles: newRoles });
    });
    openGroupSettings();
}

export async function kickMember(gid, uid) {
    if(!confirm("Kick this user?")) return;
    const gRef = doc(db, "groups", gid);
    await updateDoc(gRef, { 
        members: arrayRemove(uid)
    });
    await sendSystemMessage(gid, "A member was removed from the group.");
    openGroupSettings();
}

export async function acceptRequest(gid, uid) {
    await updateDoc(doc(db,"groups",gid), { 
        requests: arrayRemove(uid), 
        members: arrayUnion(uid),
        [`roles.${uid}`]: 'member' 
    });
    await sendSystemMessage(gid, "New member joined the group.");
    openGroupSettings();
}

export async function rejectRequest(gid, uid) {
    await updateDoc(doc(db,"groups",gid), { requests: arrayRemove(uid) });
    openGroupSettings();
}

export async function exitGroup(gid) {
    if(confirm("Are you sure you want to leave?")) {
        await updateDoc(doc(db,"groups",gid), { members: arrayRemove(window.currentUser.uid) });
        await sendSystemMessage(gid, `${window.currentUser.displayName || 'A user'} left the group.`);
        closeModal('groupSettingsModal');
        closeChat();
        loadGroups();
    }
}

// Attach to window (for inline event handlers)
window.handleFab = handleFab;
window.switchTab = switchTab;
window.searchUser = searchUser;
window.createGroup = createGroup;
window.openChat = openChat;
window.closeChat = closeChat;
window.openGroupSettings = openGroupSettings;
window.saveGroupInfo = saveGroupInfo;
window.updateGroupPhoto = updateGroupPhoto;
window.updateGroupSetting = updateGroupSetting;
window.toggleGroupMute = toggleGroupMute;
window.promoteMember = promoteMember;
window.demoteMember = demoteMember;
window.kickMember = kickMember;
window.acceptRequest = acceptRequest;
window.rejectRequest = rejectRequest;
window.exitGroup = exitGroup;
