import { Button, Card, CardContent, CardHeader, Input } from '@repo/ui';
import { Copy } from 'lucide-react';
import { useState } from 'react';
import CategoryBadges from './CategoryBadge';
import CustomFieldsInput from './CustomFieldsInput';
import type { CustomField, CustomFieldValue, Election, FieldType } from './types';

const METHOD_NAMES: Record<string, string> = {
  plurality: 'Plurality',
  approval: 'Approval',
  irv: 'Instant Runoff (IRV)',
  borda: 'Borda Count',
  condorcet: 'Condorcet',
  smithApproval: 'Smith + Approval',
  rrv: 'Reweighted Range Voting (RRV)',
};

interface AdminViewProps {
  election: Election;
  electionId: string;
  onCloseSubmissions: () => void;
  onCloseVoting: () => void;
  onReopenVoting: () => void;
  onDelete: () => void;
  onUpdate: (fields: Partial<Election>) => Promise<void>;
}

const AdminView: React.FC<AdminViewProps> = ({
  election,
  electionId,
  onCloseSubmissions,
  onCloseVoting,
  onReopenVoting,
  onDelete,
  onUpdate,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(election.title);
  const [editFields, setEditFields] = useState<CustomField[]>(
    () => election.customFields?.map((f) => ({ ...f })) || []
  );
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editCandidateName, setEditCandidateName] = useState('');
  const [editCandidateFields, setEditCandidateFields] = useState<CustomFieldValue[]>([]);

  const voteUrl = `${window.location.origin}${window.location.pathname}?id=${electionId}`;
  const resultsUrl = `${window.location.origin}${window.location.pathname}?id=${electionId}&view=results`;
  const method = election.votingMethod || 'smithApproval';

  const status = !election.submissionsClosed
    ? 'Accepting submissions'
    : election.votingOpen
      ? 'Voting open'
      : 'Voting closed';

  const handleSave = async () => {
    let fieldsToSave = editFields;
    if (newFieldName.trim()) {
      fieldsToSave = [
        ...editFields,
        { id: Date.now().toString(), name: newFieldName.trim(), type: newFieldType, required: false },
      ];
      setNewFieldName('');
      setNewFieldType('text');
    }
    await onUpdate({
      title: editTitle.trim(),
      customFields: fieldsToSave,
    });
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditTitle(election.title);
    setEditFields(election.customFields?.map((f) => ({ ...f })) || []);
    setNewFieldName('');
    setNewFieldType('text');
    setEditing(false);
  };

  const addField = () => {
    if (!newFieldName.trim()) return;
    setEditFields([
      ...editFields,
      { id: Date.now().toString(), name: newFieldName.trim(), type: newFieldType, required: false },
    ]);
    setNewFieldName('');
    setNewFieldType('text');
  };

  const removeField = (id: string) => {
    setEditFields(editFields.filter((f) => f.id !== id));
  };

  const moveField = (from: number, to: number) => {
    const updated = [...editFields];
    const [item] = updated.splice(from, 1);
    if (item) {
      updated.splice(to, 0, item);
      setEditFields(updated);
    }
  };

  const removeCandidate = async (candidateId: string) => {
    await onUpdate({
      candidates: election.candidates.filter((c) => c.id !== candidateId),
    });
  };

  const saveCandidate = async (candidateId: string) => {
    const original = election.candidates.find((c) => c.id === candidateId);
    if (!original) return;
    await onUpdate({
      candidates: election.candidates.map((c) =>
        c.id === candidateId
          ? { ...c, name: editCandidateName.trim() || c.name, customFields: editCandidateFields }
          : c
      ),
    });
    setEditingCandidateId(null);
  };

  return (
    <div className="space-y-6">
      {/* Election info */}
      <div className="space-y-1">
        <p className="text-sm text-slate-500">
          {METHOD_NAMES[method] || method} &middot; Created by {election.createdBy} &middot;{' '}
          {new Date(election.createdAt).toLocaleDateString()}
        </p>
        <p className="text-sm font-medium">
          Status:{' '}
          <span
            className={
              status === 'Voting open'
                ? 'text-green-700'
                : status === 'Voting closed'
                  ? 'text-red-700'
                  : 'text-yellow-700'
            }
          >
            {status}
          </span>
        </p>
      </div>

      {/* Edit election details */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Election Details</h3>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Edit
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {editing ? (
            <>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Title</label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-500">Custom Fields</label>
                {editFields.map((field, i) => (
                  <div key={field.id}>
                    <div className="flex gap-2 items-center">
                      <div className="flex flex-col">
                        <button
                          onClick={() => moveField(i, i - 1)}
                          disabled={i === 0}
                          className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-25 leading-none"
                        >
                          &#9650;
                        </button>
                        <button
                          onClick={() => moveField(i, i + 1)}
                          disabled={i === editFields.length - 1}
                          className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-25 leading-none"
                        >
                          &#9660;
                        </button>
                      </div>
                      <Input
                        value={field.name}
                        onChange={(e) => {
                          const updated = editFields.map((f, j) =>
                            j === i ? { ...f, name: e.target.value } : f
                          );
                          setEditFields(updated);
                        }}
                        className="flex-1"
                      />
                      <select
                        value={field.type}
                        onChange={(e) => {
                          const updated = editFields.map((f, j) =>
                            j === i ? { ...f, type: e.target.value as FieldType } : f
                          );
                          setEditFields(updated);
                        }}
                        className="p-1 rounded-md border border-slate-300 bg-white text-xs"
                      >
                        <option value="text">text</option>
                        <option value="textarea">long text</option>
                        <option value="number">number</option>
                        <option value="date">date</option>
                        <option value="select">select</option>
                        <option value="multiselect">multi-select</option>
                      </select>
                      <button
                        onClick={() => removeField(field.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        &times;
                      </button>
                    </div>
                    {(field.type === 'select' || field.type === 'multiselect') && (
                      <div className="ml-8 mt-2 space-y-1">
                        {(field.options || []).map((opt, oi) => (
                          <div key={oi} className="flex items-center gap-1">
                            <span className="text-xs text-slate-600">{opt}</span>
                            <button
                              onClick={() => {
                                const updated = editFields.map((f, j) =>
                                  j === i ? { ...f, options: f.options?.filter((_, k) => k !== oi) } : f
                                );
                                setEditFields(updated);
                              }}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              &times;
                            </button>
                          </div>
                        ))}
                        <Input
                          placeholder="Add option and press Enter..."
                          className="h-7 text-xs"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              const val = (e.target as HTMLInputElement).value.trim();
                              if (val) {
                                const updated = editFields.map((f, j) =>
                                  j === i ? { ...f, options: [...(f.options || []), val] } : f
                                );
                                setEditFields(updated);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }
                          }}
                        />
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="checkbox"
                            checked={field.allowCustomOptions || false}
                            onChange={(e) => {
                              const updated = editFields.map((f, j) =>
                                j === i ? { ...f, allowCustomOptions: e.target.checked } : f
                              );
                              setEditFields(updated);
                            }}
                            className="h-3 w-3 rounded border-gray-300"
                          />
                          <label className="text-xs text-slate-500">Allow submitters to add their own options</label>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 items-center">
                  <Input
                    value={newFieldName}
                    onChange={(e) => setNewFieldName(e.target.value)}
                    placeholder="New field name"
                    className="flex-1"
                    onKeyPress={(e) => e.key === 'Enter' && addField()}
                  />
                  <select
                    value={newFieldType}
                    onChange={(e) => setNewFieldType(e.target.value as FieldType)}
                    className="p-2 rounded-md border border-slate-300 bg-white text-xs"
                  >
                    <option value="text">text</option>
                    <option value="textarea">long text</option>
                    <option value="number">number</option>
                    <option value="date">date</option>
                    <option value="select">select</option>
                    <option value="multiselect">multi-select</option>
                  </select>
                  <Button onClick={addField} variant="secondary" size="sm">
                    Add
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} size="sm" className="flex-1">
                  Save
                </Button>
                <Button onClick={handleCancelEdit} variant="secondary" size="sm" className="flex-1">
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs text-slate-500">Title</label>
                <p className="text-sm text-slate-900">{election.title}</p>
              </div>
              {election.customFields && election.customFields.length > 0 && (
                <div>
                  <label className="text-xs text-slate-500">Custom Fields</label>
                  <ul className="space-y-1 mt-1">
                    {election.customFields.map((f) => (
                      <li key={f.id} className="text-sm text-slate-900">
                        {f.name} <span className="text-slate-400">({f.type})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Share links */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-bold text-slate-900">Share Links</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-slate-500">Voting link</label>
            <div className="flex gap-2">
              <input
                value={voteUrl}
                readOnly
                className="flex-1 p-2 rounded-md border border-slate-300 bg-slate-50 text-sm"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigator.clipboard.writeText(voteUrl)}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Results link</label>
            <div className="flex gap-2">
              <input
                value={resultsUrl}
                readOnly
                className="flex-1 p-2 rounded-md border border-slate-300 bg-slate-50 text-sm"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigator.clipboard.writeText(resultsUrl)}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-bold text-slate-900">Controls</h3>
        </CardHeader>
        <CardContent className="space-y-2">
          {!election.submissionsClosed && (
            <Button onClick={onCloseSubmissions} variant="secondary" className="w-full">
              Close Submissions & Start Voting
            </Button>
          )}
          {election.votingOpen && (
            <Button onClick={onCloseVoting} variant="secondary" className="w-full">
              Close Voting
            </Button>
          )}
          {election.submissionsClosed && !election.votingOpen && (
            <Button onClick={onReopenVoting} variant="secondary" className="w-full">
              Reopen Voting
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Candidates */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-bold text-slate-900">
            Candidates ({election.candidates.length})
          </h3>
        </CardHeader>
        <CardContent>
          {election.candidates.length === 0 ? (
            <p className="text-sm text-slate-500">No candidates yet.</p>
          ) : (
            <ul className="space-y-2">
              {election.candidates.map((c) => (
                <li key={c.id} className="text-sm p-3 bg-slate-50 rounded-md border border-slate-200">
                  {editingCandidateId === c.id ? (
                    <div className="space-y-3">
                      <Input
                        value={editCandidateName}
                        onChange={(e) => setEditCandidateName(e.target.value)}
                        placeholder={election.candidateLabel || "Candidate Name"}
                        className="w-full"
                      />
                      {election.customFields && election.customFields.length > 0 && (
                        <CustomFieldsInput
                          fields={election.customFields}
                          values={editCandidateFields}
                          onChange={setEditCandidateFields}
                        />
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => saveCandidate(c.id)}>
                          Save
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditingCandidateId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          <CategoryBadges candidate={c} customFields={election.customFields} />
                        </div>
                        {c.customFields && c.customFields.length > 0 && (
                          <div className="mt-1 text-sm text-slate-500">
                            {c.customFields.map((field) => {
                              const fieldDef = election.customFields?.find((f) => f.id === field.fieldId);
                              if (!fieldDef) return null;
                              return (
                                <span key={field.fieldId} className="inline-block mr-2">
                                  {fieldDef.name}: {field.value?.toString()}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0 ml-2">
                        <button
                          onClick={() => {
                            setEditingCandidateId(c.id);
                            setEditCandidateName(c.name);
                            setEditCandidateFields(c.customFields || []);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeCandidate(c.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Voters */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-bold text-slate-900">
            Votes ({election.votes.length})
          </h3>
        </CardHeader>
        <CardContent>
          {election.votes.length === 0 ? (
            <p className="text-sm text-slate-500">No votes yet.</p>
          ) : (
            <ul className="space-y-1">
              {election.votes.map((v, i) => (
                <li
                  key={i}
                  className="text-sm p-2 bg-slate-50 rounded-md border border-slate-200 flex justify-between"
                >
                  <span>{v.voterName}</span>
                  <span className="text-slate-400">
                    {new Date(v.timestamp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader>
          <h3 className="text-sm font-bold text-red-700">Danger Zone</h3>
        </CardHeader>
        <CardContent>
          {!confirmDelete ? (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setConfirmDelete(true)}
            >
              Delete Election
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-red-700">
                This will permanently delete this election and all its votes. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={onDelete}
                >
                  Yes, Delete
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminView;
