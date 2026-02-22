import { auth, db } from '../api/firebase.js';
import { collection, query, onSnapshot, addDoc, doc, runTransaction, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { closeModal, openModal } from '../api/utils.js';

let unsubscribePolls = null;

export function loadPolls() {
    const container = document.getElementById('pollsContainer');
    if (unsubscribePolls) unsubscribePolls();
    try {
        const q = query(collection(db, "polls"));
        unsubscribePolls = onSnapshot(q, (snapshot) => {
            container.innerHTML = '';
            if(snapshot.empty) container.innerHTML = `<div class="text-center" style="margin-top:50px; color:var(--text-muted); font-weight:600;">No polls available</div>`;
            const polls = [];
            snapshot.forEach(doc => polls.push({ id: doc.id, ...doc.data() }));
            polls.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            polls.forEach(poll => renderPollCard(poll, poll.votedUsers?.includes(window.currentUser.uid)));
        }, (error) => {
            console.log("Polls error", error);
            container.innerHTML = `<div class="text-center" style="color:#ff5252;margin-top:20px;">Polls unavailable (Permission Denied)</div>`;
        });
    } catch(e) {
        console.log(e);
    }
}

function renderPollCard(poll, hasVoted) {
    const container = document.getElementById('pollsContainer');
    const card = document.createElement('div');
    card.className = 'poll-card';

    const questionDiv = document.createElement('div');
    questionDiv.className = 'poll-question';
    questionDiv.innerText = poll.question;
    card.appendChild(questionDiv);

    const contentDiv = document.createElement('div');
    contentDiv.style.marginTop = "15px";

    if (hasVoted) {
        let maxVotes = Math.max(...poll.options.map(o => o.votes));
        let barsHTML = '';
        poll.options.forEach(opt => {
            const percent = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
            barsHTML += `<div class="result-bar-container ${opt.votes === maxVotes ? 'result-winner' : ''}"><div class="result-fill" style="width: ${percent}%;"></div><div class="result-text"><span class="label-text">${opt.text}</span><span class="percent-text">${percent}%</span></div></div>`;
        });
        contentDiv.innerHTML = barsHTML;
    } else {
        poll.options.forEach((opt, index) => {
            const btn = document.createElement('button');
            btn.className = 'vote-btn';
            btn.innerText = opt.text;
            btn.onclick = () => votePoll(poll.id, index);
            contentDiv.appendChild(btn);
        });
    }
    
    card.appendChild(contentDiv);
    container.appendChild(card);
}

export async function votePoll(pollId, optionIndex) {
    const pollRef = doc(db, "polls", pollId);
    await runTransaction(db, async (t) => {
        const docSnap = await t.get(pollRef);
        const data = docSnap.data();
        if (data.votedUsers.includes(window.currentUser.uid)) return;
        const newOptions = [...data.options];
        newOptions[optionIndex].votes += 1;
        t.update(pollRef, {
            options: newOptions,
            totalVotes: data.totalVotes + 1,
            votedUsers: arrayUnion(window.currentUser.uid)
        });
    });
}

export async function createPoll() {
    const q = document.getElementById('pollQuestion').value;
    const opts = Array.from(document.querySelectorAll('.option-field')).map((i, idx) => ({ id: idx, text: i.value, votes: 0 })).filter(o => o.text);
    if(!q || opts.length < 2) return alert("Invalid poll");
    await addDoc(collection(db, "polls"), {
        question: q,
        options: opts,
        totalVotes: 0,
        votedUsers: [],
        createdBy: window.currentUser.uid,
        createdAt: serverTimestamp()
    });
    closeModal('createPollModal');
}

export function addOptionField() {
    const list = document.getElementById('optionList');
    if(list.children.length < 5) list.innerHTML += `<input type="text" class="modal-inp option-field" placeholder="Option ${list.children.length + 1}">`;
}

// Attach to window
window.votePoll = votePoll;
window.createPoll = createPoll;
window.addOptionField = addOptionField;