import type { FC } from '../../../lib/teact/teact';
import {
  memo, useEffect, useState,
} from '../../../lib/teact/teact';
import { getActions } from '../../../global';

import type {
  ApiAvailableReaction,
  ApiReaction,
} from '../../../api/types';
import type { IAnchorPosition } from '../../../types';

import { IS_TOUCH_ENV } from '../../../util/browser/windowEnvironment';
import buildClassName from '../../../util/buildClassName';

import useEffectWithPrevDeps from '../../../hooks/useEffectWithPrevDeps';
import useFlag from '../../../hooks/useFlag';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import useMouseInside from '../../../hooks/useMouseInside';
import useOldLang from '../../../hooks/useOldLang';

import Menu from '../../ui/Menu';
import MenuItem, { MenuItemSubtitle, MenuItemTitle } from '../../ui/MenuItem';
import ReactionSelector from '../message/reactions/ReactionSelector';

import './CustomSendMenu.scss';

export type OwnProps = {
  isOpen: boolean;
  isOpenToBottom?: boolean;
  isSavedMessages?: boolean;
  canSchedule?: boolean;
  canScheduleUntilOnline?: boolean;
  onSendSilent?: NoneToVoidFunction;
  onSendSchedule?: NoneToVoidFunction;
  onSendWhenOnline?: NoneToVoidFunction;
  onRemoveEffect?: NoneToVoidFunction;
  onSendTimeCapsule?: (openDate: number) => void;
  onClose: NoneToVoidFunction;
  onCloseAnimationEnd?: NoneToVoidFunction;
  chatId?: string;
  withEffects?: boolean;
  hasCurrentEffect?: boolean;
  effectReactions?: ApiReaction[];
  allAvailableReactions?: ApiAvailableReaction[];
  onToggleReaction?: (reaction: ApiReaction) => void;
  canBuyPremium?: boolean;
  isCurrentUserPremium?: boolean;
  isInSavedMessages?: boolean;
  isInStoryViewer?: boolean;
  canPlayAnimatedEmojis?: boolean;
};

const ANIMATION_DURATION = 200;
const MORNING_HOUR = 9;
const DAYS_IN_WEEK = 7;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type TimeCapsulePreset = 'hour' | 'tomorrow' | 'week' | 'newYear';

const TIME_CAPSULE_PRESETS: TimeCapsulePreset[] = ['hour', 'tomorrow', 'week', 'newYear'];
const TIME_CAPSULE_PRESET_KEYS = {
  hour: 'TimeCapsuleInOneHour',
  tomorrow: 'TimeCapsuleTomorrow',
  week: 'TimeCapsuleInWeek',
  newYear: 'TimeCapsuleNewYear',
} as const;

const CustomSendMenu: FC<OwnProps> = ({
  isOpen,
  isOpenToBottom = false,
  isSavedMessages,
  canSchedule,
  canScheduleUntilOnline,
  onSendSilent,
  onSendSchedule,
  onSendWhenOnline,
  onRemoveEffect,
  onSendTimeCapsule,
  onClose,
  onCloseAnimationEnd,
  chatId,
  withEffects,
  hasCurrentEffect,
  effectReactions,
  allAvailableReactions,
  onToggleReaction,
  canBuyPremium,
  isCurrentUserPremium,
  isInSavedMessages,
  isInStoryViewer,
  canPlayAnimatedEmojis,
}) => {
  const {
    openEffectPicker,
  } = getActions();

  const [handleMouseEnter, handleMouseLeave] = useMouseInside(isOpen, onClose);
  const [displayScheduleUntilOnline, setDisplayScheduleUntilOnline] = useState(false);

  const oldLang = useOldLang();
  const lang = useLang();
  const [areItemsHidden, hideItems, showItems] = useFlag();
  const [isTimeCapsuleMode, openTimeCapsuleMode, closeTimeCapsuleMode] = useFlag();

  useEffectWithPrevDeps(([prevIsOpen]) => {
    // Avoid context menu item shuffling when opened
    if (isOpen && !prevIsOpen) {
      showItems();
      closeTimeCapsuleMode();
      setDisplayScheduleUntilOnline(Boolean(canScheduleUntilOnline));
    }
  }, [isOpen, canScheduleUntilOnline]);

  const [isReady, markIsReady, unmarkIsReady] = useFlag();

  const handleTimeCapsuleClick = useLastCallback((e: React.SyntheticEvent) => {
    // Keeps the menu open to pick when the capsule opens
    e.stopPropagation();
    openTimeCapsuleMode();
  });

  const handleTimeCapsulePresetClick = useLastCallback((e: React.SyntheticEvent, presetIndex?: number) => {
    onSendTimeCapsule!(getTimeCapsuleOpenDate(TIME_CAPSULE_PRESETS[presetIndex!]));
  });

  const handleOpenMessageEffectsPicker = useLastCallback((position: IAnchorPosition) => {
    hideItems();
    if (chatId) openEffectPicker({ chatId, position });
  });

  useEffect(() => {
    if (!isOpen) {
      unmarkIsReady();
      return;
    }

    const timeout = setTimeout(() => {
      markIsReady();
    }, ANIMATION_DURATION);

    return () => {
      clearTimeout(timeout);
    };
  }, [isOpen, markIsReady, unmarkIsReady]);

  return (
    <Menu
      isOpen={isOpen}
      autoClose
      positionX="right"
      positionY={isOpenToBottom ? 'top' : 'bottom'}
      className={buildClassName(
        'CustomSendMenu', 'fluid', 'with-menu-transitions', withEffects && 'with-effects',
      )}
      onClose={onClose}
      onCloseAnimationEnd={onCloseAnimationEnd}
      onMouseEnter={!IS_TOUCH_ENV ? handleMouseEnter : undefined}
      onMouseLeave={!IS_TOUCH_ENV ? handleMouseLeave : undefined}
      noCloseOnBackdrop={!IS_TOUCH_ENV}
    >

      {withEffects && !isInStoryViewer && (
        <ReactionSelector
          allAvailableReactions={allAvailableReactions}
          effectReactions={effectReactions}
          currentReactions={undefined}
          onToggleReaction={onToggleReaction!}
          isPrivate
          isReady={isReady}
          canBuyPremium={canBuyPremium}
          isCurrentUserPremium={isCurrentUserPremium}
          isInSavedMessages={isInSavedMessages}
          isForEffects
          canPlayAnimatedEmojis={canPlayAnimatedEmojis}
          onShowMore={handleOpenMessageEffectsPicker}
          onClose={onClose}
          className={buildClassName(areItemsHidden && 'ReactionSelector-hidden')}
        />
      )}

      <div
        className={buildClassName(
          'CustomSendMenu_items',
          areItemsHidden && 'CustomSendMenu_items-hidden',
        )}
        dir={lang.isRtl ? 'rtl' : undefined}
      >
        {isTimeCapsuleMode && (
          <>
            <div className="CustomSendMenu_title">{lang('TimeCapsulePickerTitle')}</div>
            {TIME_CAPSULE_PRESETS.map((preset, i) => (
              <MenuItem icon="timer" clickArg={i} onClick={handleTimeCapsulePresetClick}>
                <MenuItemTitle>{lang(TIME_CAPSULE_PRESET_KEYS[preset])}</MenuItemTitle>
                <MenuItemSubtitle>{formatOpenDate(getTimeCapsuleOpenDate(preset), lang.code)}</MenuItemSubtitle>
              </MenuItem>
            ))}
          </>
        )}
        {!isTimeCapsuleMode && onSendSilent && (
          <MenuItem icon="mute" onClick={onSendSilent}>{oldLang('SendWithoutSound')}</MenuItem>
        )}
        {!isTimeCapsuleMode && onSendTimeCapsule && (
          <MenuItem icon="lock" onClick={handleTimeCapsuleClick}>{lang('TimeCapsuleSend')}</MenuItem>
        )}
        {!isTimeCapsuleMode && canSchedule && onSendSchedule && (
          <MenuItem icon="schedule" onClick={onSendSchedule}>
            {oldLang(isSavedMessages ? 'SetReminder' : 'ScheduleMessage')}
          </MenuItem>
        )}
        {!isTimeCapsuleMode && canSchedule && onSendSchedule && displayScheduleUntilOnline && (
          <MenuItem icon="user-online" onClick={onSendWhenOnline}>
            {oldLang('SendWhenOnline')}
          </MenuItem>
        )}
        {!isTimeCapsuleMode && withEffects && hasCurrentEffect && (
          <MenuItem icon="delete" onClick={onRemoveEffect}>
            {lang('RemoveEffect')}
          </MenuItem>
        )}
      </div>
    </Menu>
  );
};

function formatOpenDate(openDate: number, locale: string) {
  return new Date(openDate * 1000).toLocaleString(locale, {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function getTimeCapsuleOpenDate(preset: TimeCapsulePreset) {
  const now = new Date();
  switch (preset) {
    case 'hour':
      return Math.round((now.getTime() + HOUR_MS) / 1000);
    case 'tomorrow':
      return Math.round(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, MORNING_HOUR).getTime() / 1000);
    case 'week':
      return Math.round((now.getTime() + DAYS_IN_WEEK * DAY_MS) / 1000);
    case 'newYear':
      return Math.round(new Date(now.getFullYear() + 1, 0, 1).getTime() / 1000);
  }
}

export default memo(CustomSendMenu);
