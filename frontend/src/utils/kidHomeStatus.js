function alpha(color, value) {
  return color ? `${color}${value}` : undefined
}

export function buildKidHomeThemeStyles(theme = {}) {
  const accent = theme?.cardAccent
  if (!accent) {
    return {
      surfaceStyle: undefined,
      initialStyle: undefined,
    }
  }

  return {
    surfaceStyle: {
      borderColor: alpha(accent, '2E'),
      boxShadow: `0 0 16px ${alpha(accent, '10')}, inset 0 1px 0 ${alpha(accent, '0D')}`,
      background: `linear-gradient(180deg, ${alpha(accent, '08')} 0%, var(--color-surface) 62%)`,
    },
    initialStyle: {
      borderColor: alpha(accent, '45'),
      backgroundColor: alpha(accent, '16'),
      color: accent,
    },
  }
}

function choresLabel(count) {
  return count === 1 ? 'chore' : 'chores'
}

export function buildPrizeSpinStatus({
  spinEnabled = true,
  requiredTotal = 0,
  requiredLeft = 0,
  requiredComplete = false,
  availability = null,
} = {}) {
  const title = "Today's Prize Spin"
  const left = Math.max(0, Number(requiredLeft) || 0)
  const total = Math.max(0, Number(requiredTotal) || 0)

  if (total === 0) {
    return {
      state: 'idle',
      title,
      detail: 'No required chores today.',
      buttonLabel: 'No spin',
      canOpen: false,
    }
  }

  if (!spinEnabled) {
    return {
      state: requiredComplete ? 'complete' : 'off',
      title,
      detail: requiredComplete
        ? 'All required chores are done today.'
        : 'Finish today to keep your streak going.',
      buttonLabel: requiredComplete ? 'Done' : 'Off',
      canOpen: false,
    }
  }

  if (!requiredComplete) {
    return {
      state: 'locked',
      title,
      detail: `Finish ${left} more ${choresLabel(left)} to unlock.`,
      buttonLabel: 'Locked',
      canOpen: false,
    }
  }

  if (availability?.can_spin === false) {
    if (availability?.last_result != null) {
      return {
        state: 'used',
        title,
        detail: `Prize collected: +${availability.last_result} XP`,
        buttonLabel: 'Done',
        canOpen: false,
      }
    }

    return {
      state: 'used',
      title,
      detail: availability?.reason || 'Prize already collected today.',
      buttonLabel: 'Done',
      canOpen: false,
    }
  }

  return {
    state: 'ready',
    title,
    detail: 'Ready after finishing today.',
    buttonLabel: 'Spin',
    canOpen: true,
  }
}
