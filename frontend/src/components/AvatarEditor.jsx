import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import AvatarDisplay from './AvatarDisplay';
import { Save, Loader2, ChevronLeft, ChevronRight, Lock, ArrowLeft } from 'lucide-react';

const HEAD_OPTIONS = [
  { id: 'round', label: 'Round' },
  { id: 'oval', label: 'Oval' },
  { id: 'square', label: 'Square' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'heart', label: 'Heart' },
  { id: 'long', label: 'Long' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'pear', label: 'Pear' },
  { id: 'wide', label: 'Wide' },
];

const HAIR_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
  { id: 'spiky', label: 'Spiky' },
  { id: 'curly', label: 'Curly' },
  { id: 'mohawk', label: 'Mohawk' },
  { id: 'buzz', label: 'Buzz' },
  { id: 'ponytail', label: 'Ponytail' },
  { id: 'bun', label: 'Bun' },
  { id: 'pigtails', label: 'Pigtails' },
  { id: 'afro', label: 'Afro' },
  { id: 'braids', label: 'Braids' },
  { id: 'wavy', label: 'Wavy' },
  { id: 'side_part', label: 'Side Part' },
  { id: 'fade', label: 'Fade' },
  { id: 'dreadlocks', label: 'Dreads' },
  { id: 'bob', label: 'Bob' },
  { id: 'shoulder', label: 'Shoulder' },
  { id: 'undercut', label: 'Undercut' },
  { id: 'twin_buns', label: 'Twin Buns' },
];

const EYES_OPTIONS = [
  { id: 'normal', label: 'Normal' },
  { id: 'happy', label: 'Happy' },
  { id: 'wide', label: 'Wide' },
  { id: 'sleepy', label: 'Sleepy' },
  { id: 'wink', label: 'Wink' },
  { id: 'angry', label: 'Angry' },
  { id: 'dot', label: 'Dot' },
  { id: 'star', label: 'Star' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'sunglasses', label: 'Shades' },
  { id: 'eye_patch', label: 'Eye Patch' },
  { id: 'crying', label: 'Crying' },
  { id: 'heart_eyes', label: 'Hearts' },
  { id: 'dizzy', label: 'Dizzy' },
  { id: 'closed', label: 'Closed' },
];

const MOUTH_OPTIONS = [
  { id: 'smile', label: 'Smile' },
  { id: 'grin', label: 'Grin' },
  { id: 'neutral', label: 'Neutral' },
  { id: 'open', label: 'Open' },
  { id: 'tongue', label: 'Tongue' },
  { id: 'frown', label: 'Frown' },
  { id: 'surprised', label: 'Surprised' },
  { id: 'smirk', label: 'Smirk' },
  { id: 'braces', label: 'Braces' },
  { id: 'vampire', label: 'Vampire' },
  { id: 'whistle', label: 'Whistle' },
  { id: 'mask', label: 'Mask' },
  { id: 'beard', label: 'Beard' },
  { id: 'moustache', label: 'Moustache' },
];

const BODY_OPTIONS = [
  { id: 'slim', label: 'Slim' },
  { id: 'regular', label: 'Regular' },
  { id: 'broad', label: 'Broad' },
];

const HAT_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'crown', label: 'Crown' },
  { id: 'wizard', label: 'Wizard' },
  { id: 'beanie', label: 'Beanie' },
  { id: 'cap', label: 'Cap' },
  { id: 'pirate', label: 'Pirate' },
  { id: 'headphones', label: 'Headphones' },
  { id: 'tiara', label: 'Tiara' },
  { id: 'horns', label: 'Horns' },
  { id: 'bunny_ears', label: 'Bunny Ears' },
  { id: 'cat_ears', label: 'Cat Ears' },
  { id: 'halo', label: 'Halo' },
  { id: 'viking', label: 'Viking' },
];

const ACCESSORY_OPTIONS = [
  { id: 'scarf', label: 'Scarf' },
  { id: 'necklace', label: 'Necklace' },
  { id: 'bow_tie', label: 'Bow Tie' },
  { id: 'cape', label: 'Cape' },
  { id: 'wings', label: 'Wings' },
  { id: 'shield', label: 'Shield' },
  { id: 'sword', label: 'Sword' },
];

const FACE_EXTRA_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'freckles', label: 'Freckles' },
  { id: 'blush', label: 'Blush' },
  { id: 'face_paint', label: 'Face Paint' },
  { id: 'scar', label: 'Scar' },
  { id: 'bandage', label: 'Bandage' },
  { id: 'stickers', label: 'Stickers' },
];

const OUTFIT_PATTERN_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'stars', label: 'Stars' },
  { id: 'camo', label: 'Camo' },
  { id: 'tie_dye', label: 'Tie Dye' },
  { id: 'plaid', label: 'Plaid' },
];

const SKIN_COLORS = [
  '#ffe0bd', '#ffcc99', '#f5d6b8', '#f8d9c0',
  '#e8b88a', '#d4a373', '#c68642', '#a67c52',
  '#8d5524', '#6b3a2a', '#4a2912', '#3b1f0e',
  '#f0c4a8', '#d4956a', '#b07848', '#8a6642',
];

const HAIR_COLORS = [
  '#4a3728', '#1a1a2e', '#8b4513', '#d4a017',
  '#c0392b', '#2e86c1', '#7d3c98', '#27ae60',
  '#e74c3c', '#f39c12', '#ecf0f1', '#ff6b9d',
];

const EYE_COLORS = [
  '#333333', '#1a5276', '#27ae60', '#8b4513',
  '#7d3c98', '#c0392b', '#2e86c1', '#e74c3c',
];

const MOUTH_COLORS = [
  '#cc6666', '#e74c3c', '#d4a373', '#c0392b',
  '#ff6b9d', '#a93226', '#8b4513', '#333333',
];

const BODY_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
  '#a855f7', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#6366f1', '#1a1a2e', '#ecf0f1',
];

const BG_COLORS = [
  '#1a1a2e', '#0f0e17', '#16213e', '#1b4332',
  '#4a1942', '#2d1b69', '#1a3a3a', '#3d0c02',
  '#2e86c1', '#27ae60', '#f39c12', '#8e44ad',
];

const HAT_COLORS = [
  '#f39c12', '#e74c3c', '#3b82f6', '#10b981',
  '#a855f7', '#ec4899', '#f59e0b', '#1a1a2e',
  '#c0c0c0', '#f9d71c', '#8b4513', '#ecf0f1',
];

const ACCESSORY_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f39c12',
  '#a855f7', '#ec4899', '#c0c0c0', '#f9d71c',
  '#8b4513', '#1a1a2e', '#ecf0f1', '#06b6d4',
];

const AVATAR_CONFIG_VERSION = 2;

const DEFAULT_CONFIG = {
  _v: AVATAR_CONFIG_VERSION,
  head: 'round',
  hair: 'short',
  eyes: 'normal',
  mouth: 'smile',
  body: 'regular',
  head_color: '#ffcc99',
  hair_color: '#4a3728',
  eye_color: '#333333',
  mouth_color: '#cc6666',
  body_color: '#3b82f6',
  bg_color: '#1a1a2e',
  hat: 'none',
  hat_color: '#f39c12',
  accessory: 'none',
  accessories: [],
  accessory_color: '#3b82f6',
  face_extra: 'none',
  outfit_pattern: 'none',
};

const CATEGORIES = [
  { id: 'head', label: 'Head' },
  { id: 'skin', label: 'Skin' },
  { id: 'hair', label: 'Hair' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'mouth', label: 'Mouth' },
  { id: 'body', label: 'Body' },
  { id: 'outfit', label: 'Outfit' },
  { id: 'pattern', label: 'Pattern' },
  { id: 'background', label: 'BG' },
  { id: 'hat', label: 'Hat' },
  { id: 'face', label: 'Face' },
  { id: 'accessory', label: 'Gear' },
];

function ColorSwatch({ colors, selected, onSelect }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onSelect(c)}
          className={`w-7 h-7 rounded-full border-2 transition-all ${
            selected === c ? 'border-accent' : 'border-transparent hover:border-border-light'
          }`}
          style={{ backgroundColor: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}

function ShapeSelector({ options, selected, onSelect, lockedItems, configKey, onPreview, onPreviewEnd }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isLocked = lockedItems && lockedItems.has(opt.id);
        return (
          <button
            key={opt.id}
            onClick={() => !isLocked && onSelect(opt.id)}
            onMouseEnter={() => isLocked && configKey && onPreview?.(configKey, opt.id)}
            onMouseLeave={() => isLocked && onPreviewEnd?.()}
            onTouchStart={() => isLocked && configKey && onPreview?.(configKey, opt.id)}
            onTouchEnd={() => isLocked && onPreviewEnd?.()}
            onTouchCancel={() => isLocked && onPreviewEnd?.()}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1 select-none ${
              isLocked
                ? 'border-amber-500/30 text-muted/60 bg-amber-500/5'
                : selected === opt.id
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted hover:border-border-light hover:text-cream'
            }`}
            style={isLocked ? { WebkitTouchCallout: 'none', touchAction: 'manipulation' } : undefined}
          >
            {isLocked && <Lock size={10} className="text-amber-500/60" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function MultiShapeSelector({ options, selected, onToggle, lockedItems, configKey, onPreview, onPreviewEnd }) {
  // selected is an array of ids
  const selectedSet = new Set(selected || []);
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isLocked = lockedItems && lockedItems.has(opt.id);
        const isActive = selectedSet.has(opt.id);
        return (
          <button
            key={opt.id}
            onClick={() => !isLocked && onToggle(opt.id)}
            onMouseEnter={() => isLocked && configKey && onPreview?.(configKey, opt.id)}
            onMouseLeave={() => isLocked && onPreviewEnd?.()}
            onTouchStart={() => isLocked && configKey && onPreview?.(configKey, opt.id)}
            onTouchEnd={() => isLocked && onPreviewEnd?.()}
            onTouchCancel={() => isLocked && onPreviewEnd?.()}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1 select-none ${
              isLocked
                ? 'border-amber-500/30 text-muted/60 bg-amber-500/5'
                : isActive
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted hover:border-border-light hover:text-cream'
            }`}
            style={isLocked ? { WebkitTouchCallout: 'none', touchAction: 'manipulation' } : undefined}
          >
            {isLocked && <Lock size={10} className="text-amber-500/60" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function CategoryContent({ category, config, set, lockedByCategory, onPreview, onPreviewEnd }) {
  const locked = lockedByCategory[category] || new Set();
  const previewProps = { onPreview, onPreviewEnd };
  switch (category) {
    case 'head':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Shape</p>
          <ShapeSelector options={HEAD_OPTIONS} selected={config.head} onSelect={(v) => set('head', v)} lockedItems={locked} configKey="head" {...previewProps} />
        </div>
      );
    case 'skin':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Colour</p>
          <ColorSwatch colors={SKIN_COLORS} selected={config.head_color} onSelect={(v) => set('head_color', v)} />
        </div>
      );
    case 'hair':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Style</p>
          <ShapeSelector options={HAIR_OPTIONS} selected={config.hair} onSelect={(v) => set('hair', v)} lockedItems={locked} configKey="hair" {...previewProps} />
          <p className="text-muted text-xs font-medium">Colour</p>
          <ColorSwatch colors={HAIR_COLORS} selected={config.hair_color} onSelect={(v) => set('hair_color', v)} />
        </div>
      );
    case 'eyes':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Style</p>
          <ShapeSelector options={EYES_OPTIONS} selected={config.eyes} onSelect={(v) => set('eyes', v)} lockedItems={locked} configKey="eyes" {...previewProps} />
          <p className="text-muted text-xs font-medium">Colour</p>
          <ColorSwatch colors={EYE_COLORS} selected={config.eye_color} onSelect={(v) => set('eye_color', v)} />
        </div>
      );
    case 'mouth':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Style</p>
          <ShapeSelector options={MOUTH_OPTIONS} selected={config.mouth} onSelect={(v) => set('mouth', v)} lockedItems={locked} configKey="mouth" {...previewProps} />
          <p className="text-muted text-xs font-medium">Colour</p>
          <ColorSwatch colors={MOUTH_COLORS} selected={config.mouth_color} onSelect={(v) => set('mouth_color', v)} />
        </div>
      );
    case 'body':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Shape</p>
          <ShapeSelector options={BODY_OPTIONS} selected={config.body} onSelect={(v) => set('body', v)} />
        </div>
      );
    case 'outfit':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Colour</p>
          <ColorSwatch colors={BODY_COLORS} selected={config.body_color} onSelect={(v) => set('body_color', v)} />
        </div>
      );
    case 'pattern':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Pattern</p>
          <ShapeSelector options={OUTFIT_PATTERN_OPTIONS} selected={config.outfit_pattern} onSelect={(v) => set('outfit_pattern', v)} lockedItems={locked} configKey="outfit_pattern" {...previewProps} />
        </div>
      );
    case 'background':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Colour</p>
          <ColorSwatch colors={BG_COLORS} selected={config.bg_color} onSelect={(v) => set('bg_color', v)} />
        </div>
      );
    case 'hat':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Style</p>
          <ShapeSelector options={HAT_OPTIONS} selected={config.hat} onSelect={(v) => set('hat', v)} lockedItems={locked} configKey="hat" {...previewProps} />
          <p className="text-muted text-xs font-medium">Colour</p>
          <ColorSwatch colors={HAT_COLORS} selected={config.hat_color} onSelect={(v) => set('hat_color', v)} />
        </div>
      );
    case 'face':
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Extra</p>
          <ShapeSelector options={FACE_EXTRA_OPTIONS} selected={config.face_extra} onSelect={(v) => set('face_extra', v)} lockedItems={locked} configKey="face_extra" {...previewProps} />
        </div>
      );
    case 'accessory': {
      // Multi-accessory: read from accessories array, fall back to legacy single
      const currentAccessories = Array.isArray(config.accessories) && config.accessories.length > 0
        ? config.accessories
        : (config.accessory && config.accessory !== 'none' ? [config.accessory] : []);
      const toggleAccessory = (id) => {
        const cur = new Set(currentAccessories);
        if (cur.has(id)) cur.delete(id); else cur.add(id);
        const arr = [...cur];
        // set() uses functional updates internally so sequential calls chain correctly
        set('accessories', arr);
        set('accessory', arr.length > 0 ? arr[0] : 'none');
      };
      const clearAll = () => {
        set('accessories', []);
        set('accessory', 'none');
      };
      return (
        <div className="space-y-3">
          <p className="text-muted text-xs font-medium">Gear <span className="text-muted/50">(select multiple)</span></p>
          <MultiShapeSelector options={ACCESSORY_OPTIONS} selected={currentAccessories} onToggle={toggleAccessory} lockedItems={locked} configKey="accessory" {...previewProps} />
          {currentAccessories.length > 0 && (
            <button onClick={clearAll} className="text-[10px] text-crimson hover:text-crimson/80 transition-colors">
              Clear all gear
            </button>
          )}
          <p className="text-muted text-xs font-medium">Colour</p>
          <ColorSwatch colors={ACCESSORY_COLORS} selected={config.accessory_color} onSelect={(v) => set('accessory_color', v)} />
        </div>
      );
    }
    default:
      return null;
  }
}

const EDITOR_TO_ITEM_CATEGORY = {
  head: 'head', hair: 'hair', eyes: 'eyes', mouth: 'mouth',
  hat: 'hat', accessory: 'accessory', face: 'face_extra',
  pattern: 'outfit_pattern',
};

function CategoryStrip({ openCategory, onSelect }) {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 120, behavior: 'smooth' });
  };

  return (
    <div className="flex-shrink-0 border-b border-border bg-surface px-1 py-2 relative">
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll(-1)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-surface/90 border border-border text-muted hover:text-cream"
          aria-label="Scroll left"
        >
          <ChevronLeft size={14} />
        </button>
      )}

      {/* Scrollable strip */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-0.5 px-2 scrollbar-hide"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              openCategory === cat.id
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border text-muted hover:border-border-light hover:text-cream'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll(1)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-surface/90 border border-border text-muted hover:text-cream"
          aria-label="Scroll right"
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

export default function AvatarEditor() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState(() => ({
    ...DEFAULT_CONFIG,
    ...(user?.avatar_config || {}),
  }));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [openCategory, setOpenCategory] = useState('head');
  const [lockedByCategory, setLockedByCategory] = useState({});
  const [preview, setPreview] = useState(null);

  const goBack = useCallback(() => navigate(-1), [navigate]);

  // Fetch avatar items to determine locks
  const fetchLocks = useCallback(async () => {
    try {
      const items = await api('/api/avatar/items');
      if (!Array.isArray(items)) return;
      const lockMap = {};
      for (const item of items) {
        if (!item.unlocked && !item.is_default) {
          if (!lockMap[item.category]) lockMap[item.category] = new Set();
          lockMap[item.category].add(item.item_id);
        }
      }
      setLockedByCategory(lockMap);
    } catch {
      // If fetch fails, don't lock anything
    }
  }, []);

  useEffect(() => { fetchLocks(); }, [fetchLocks]);

  // Reset config from user when avatar_config changes
  useEffect(() => {
    if (user?.avatar_config) {
      setConfig((prev) => {
        // Only reset if user config actually changed (e.g. after save from another tab)
        const userCfg = { ...DEFAULT_CONFIG, ...(user.avatar_config || {}) };
        if (JSON.stringify(prev) === JSON.stringify(userCfg)) return prev;
        return userCfg;
      });
    }
  }, [user?.avatar_config]);

  // Escape key to go back
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') goBack(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [goBack]);

  // Compute display config (with preview overlay)
  const displayConfig = preview ? { ...config, [preview.key]: preview.value } : config;

  const editorLocks = {};
  for (const [editorCat, itemCat] of Object.entries(EDITOR_TO_ITEM_CATEGORY)) {
    if (lockedByCategory[itemCat]) {
      editorLocks[editorCat] = lockedByCategory[itemCat];
    }
  }

  const set = (key, value) => {
    setConfig((prev) => {
      return { ...prev, [key]: value };
    });
    setMsg('');
  };

  const handlePreview = useCallback((key, value) => setPreview({ key, value }), []);
  const handlePreviewEnd = useCallback(() => setPreview(null), []);

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await api('/api/avatar', { method: 'PUT', body: { config } });
      updateUser({ avatar_config: res.avatar_config || config });
      setMsg('Saved!');
      setTimeout(() => goBack(), 600);
    } catch (err) {
      setMsg(err.message || 'Failed to save');
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      {/* ─── Pinned top: back button + avatar preview ─── */}
      <div className="flex-shrink-0 border-b border-border bg-surface-raised/50 px-4 pt-3 pb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={goBack}
              className="p-1.5 rounded-lg hover:bg-surface-raised transition-colors text-muted hover:text-cream"
              aria-label="Back"
            >
              <ArrowLeft size={18} />
            </button>
            <h2 className="font-heading text-cream text-sm font-semibold">Customise Avatar</h2>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="game-btn game-btn-blue flex items-center gap-1.5 !py-1.5 !px-4 !text-xs"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving...' : msg || 'Save'}
          </button>
        </div>
        <div className="flex justify-center">
          <div className={`avatar-idle rounded-md transition-shadow duration-300`}>
            <AvatarDisplay config={displayConfig} size="xl" />
          </div>
        </div>
      </div>

      {/* ─── Category strip (pinned, horizontal scroll with arrows) ─── */}
      <CategoryStrip openCategory={openCategory} onSelect={setOpenCategory} />

      {/* ─── Scrollable options area ─── */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        {openCategory && (
          <CategoryContent
            category={openCategory}
            config={config}
            set={set}
            lockedByCategory={editorLocks}
            onPreview={handlePreview}
            onPreviewEnd={handlePreviewEnd}
          />
        )}
      </div>
    </div>
  );
}
