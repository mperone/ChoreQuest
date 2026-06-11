import { useState, useEffect } from 'react';
import { api } from '../api/client';
import Modal from './Modal';

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy', level: 1 },
  { value: 'medium', label: 'Medium', level: 2 },
  { value: 'hard', label: 'Hard', level: 3 },
  { value: 'expert', label: 'Expert', level: 4 },
];

const selectClass =
  'bg-navy-light border border-border text-cream p-2 rounded text-sm ' +
  'focus:border-accent focus:outline-none transition-colors';

const emptyForm = {
  title: '',
  description: '',
  points: 10,
  difficulty: 'easy',
  category_id: '',
};

export default function QuestCreateModal({
  isOpen,
  onClose,
  onCreated,
  categories,
  editingChore,
}) {
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingChore) {
        setForm({
          title: editingChore.title || '',
          description: editingChore.description || '',
          points: editingChore.points || 10,
          difficulty: editingChore.difficulty || 'easy',
          category_id: editingChore.category_id ? String(editingChore.category_id) : '',
        });
      } else {
        setForm({ ...emptyForm });
      }
      setFormError('');
    }
  }, [isOpen, editingChore]);

  const updateForm = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setFormError('Every quest needs a name, adventurer!');
      return;
    }
    if (form.points < 1) {
      setFormError('The reward must be at least 1 XP.');
      return;
    }
    if (!form.category_id) {
      setFormError('Please select a category for this quest.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      points: Number(form.points),
      difficulty: form.difficulty,
      category_id: Number(form.category_id),
      // New quests from this flow don't set recurrence/photo on the chore itself
      recurrence: 'once',
      requires_photo: false,
      assigned_user_ids: [],
    };

    try {
      if (editingChore) {
        await api(`/api/chores/${editingChore.id}`, { method: 'PUT', body });
      } else {
        await api('/api/chores', { method: 'POST', body });
      }
      onCreated();
      onClose();
    } catch (err) {
      setFormError(err.message || 'The quest scroll could not be saved.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingChore ? 'Edit Quest Scroll' : 'New Quest Scroll'}
      actions={[
        { label: 'Cancel', onClick: onClose, className: 'game-btn game-btn-blue' },
        {
          label: submitting ? 'Saving...' : editingChore ? 'Update Quest' : 'Create Quest',
          onClick: handleSubmit,
          className: 'game-btn game-btn-gold',
          disabled: submitting,
        },
      ]}
    >
      <div className="space-y-4">
        {formError && (
          <div className="p-2 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
            {formError}
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
            Quest Name
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => updateForm('title', e.target.value)}
            placeholder="Defeat the Dust Bunnies"
            className="field-input"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => updateForm('description', e.target.value)}
            placeholder="Describe the quest details..."
            rows={3}
            className="field-input resize-none"
          />
        </div>

        {/* Points & Difficulty */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
              XP Reward
            </label>
            <input
              type="number"
              min={1}
              value={form.points}
              onChange={(e) => updateForm('points', e.target.value)}
              className="field-input"
            />
          </div>
          <div>
            <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
              Difficulty
            </label>
            <select
              value={form.difficulty}
              onChange={(e) => updateForm('difficulty', e.target.value)}
              className={`${selectClass} w-full p-3`}
            >
              {DIFFICULTY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-cream text-sm font-medium mb-1 tracking-wide">
            Category
          </label>
          <select
            value={form.category_id}
            onChange={(e) => updateForm('category_id', e.target.value)}
            className={`${selectClass} w-full p-3`}
          >
            <option value="">Select category...</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}
