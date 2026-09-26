import {
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

export async function deleteElection(db: Firestore, electionId: string): Promise<void> {
  const electionRef = doc(db, 'elections', electionId);
  // Wait for the server to close voting before taking the ballot snapshot.
  // The ballot create rule then rejects any late voter transactions.
  await updateDoc(electionRef, { votingOpen: false });
  // A cached query could miss ballots committed just before voting closed.
  const ballotDocs = (await getDocsFromServer(collection(electionRef, 'votes'))).docs;
  // Firestore does not cascade deletes; clear every ballot before its parent.
  for (let i = 0; i < ballotDocs.length; i += 500) {
    const batch = writeBatch(db);
    ballotDocs.slice(i, i + 500).forEach((ballot) => batch.delete(ballot.ref));
    await batch.commit();
  }
  await deleteDoc(electionRef);
}
