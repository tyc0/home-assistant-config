# Calendar Notification System Requirements

I want an automated calendar event notification system for a household with two people (Cam and Enhy). Here's the intent:

## Core Purpose

- Automatically notify household members about upcoming calendar events
- Categorize events by person and type for easy scanning
- Deliver notifications at strategic times throughout the day

## Event Categories

- **Cam**: Personal events for Cam (from `calendar.cam` and `calendar.both`)
- **Enhy**: Personal events for Enhy (from `calendar.enhy` and `calendar.both`)
- **Info**: General informational events (holidays, special days from `calendar.special_day`, `calendar.united_kingdom_eng`)

## Features

- **Toggle Control**: `input_boolean.calendar_notifications` to enable/disable
- **Multi-Device Delivery**: Sends to phones and iPad simultaneously
- **Testing**: Manual test button and script for verification
- **Status Monitoring**: Template sensor showing calendar system health
- **Persistent + Mobile**: Both in-app notifications and push notifications

## Event Duration Categories

Events should be considered to be in one of three groups:

- **Timed event**: A single event with a duration of under 23 hours
- **All day event**: A single event with a duration between 23 and 47 hours (inclusive)
- **Multi day event**: A single event with a duration of over 47 hours

## Notification Schedule

- **18:00**: Tomorrow's schedule preview
- **06:00**: Today's events morning reminder
- For timed events, an additional notification should be issued 15 minutes before the event start
- For multi day events, notifications should only be sent for the first and the last day of the event, not for every day in the event. The notification should specify whether it is the first or last day of a multi-day event

## Privacy Conditions

Cam's devices should not receive event information from Enhy's calendars, and vice-versa. Both Cam and Enhy should receive event notifications from all other calendars.

## Notification Persistence Rules

Notifications should be sent with persistence and tagging. They should persist until one of the following conditions has been met:

1. The user manually removes the notification
1. At 18:00, if the notification contains no unfinished timed events. In this case, the notification should be replaced by a new notification containing the next day's events if there are any. Otherwise, it can be simply removed
1. If the notification contains only timed events, the notification can be removed at the end of the last event in the day

## Event Carryover Logic

There may be instances where a timed event starts later than 18:00. If a notification gets replaced by a new one containing the next day's events, any remaining timed events of the current day should carry over to the new notification. **It is critical that no events go missing from notifications unless they have finished.**

## Use Case

Perfect for couples who want proactive calendar awareness without manually checking multiple calendars. The time-based triggers ensure they see tomorrow's schedule while planning the evening, and today's events when starting the day.

## Notification Message Format

Notifications should use a consistent, scannable format with emoji indicators:

```
📅 Tomorrow (15 Jun)
👤 Cam: Doctor appointment (10:00)
👥 Both: Anniversary dinner (19:00)
ℹ️ Info: Father's Day
```

**Format Rules:**
- **Header**: Always start with 📅 and the date reference ("Today" or "Tomorrow") with actual date in parentheses
- **Person Icons**: 👤 for individual events, 👥 for shared events, ℹ️ for informational events
- **Time Display**: Show time in 24-hour format for timed events, omit for all-day events
- **Multi-day Events**: Append "(Day 1 of 5)" or "(Final day)" as appropriate
- **15-minute Warnings**: Use ⏰ prefix and format as "Starting in 15 minutes: [Event name]"

**Example Templates:**

Morning Notification (06:00):
```
📅 Today (14 Jun)
👤 Enhy: Team standup (09:00)
👥 Both: Lunch with parents (12:30)
ℹ️ Info: World Blood Donor Day
```

Evening Preview (18:00):
```
📅 Tomorrow (15 Jun)
👤 Cam: Dentist appointment (10:00)
👤 Cam: Gym class (18:30)
ℹ️ Info: Father's Day
```

15-Minute Warning:
```
⏰ Starting in 15 minutes: Team standup (09:00)
```

-----

## System Dependencies

### Required Integrations

**Calendar Integrations:**
- Google Calendar (or equivalent) for:
  - `calendar.cam` - Cam's personal calendar
  - `calendar.enhy` - Enhy's personal calendar  
  - `calendar.both` - Shared calendar
  - `calendar.special_day` - Holiday/special day calendar
  - `calendar.united_kingdom_eng` - UK public holidays

**Notification Services:**
- Mobile App integration for:
  - `notify.mobile_app_phone_c` - Cam's phone
  - `notify.mobile_app_phone_e` - Enhy's phone
  - `notify.mobile_app_ipad` - Shared iPad
- Persistent Notification (built-in)

### Required Helpers

**Input Boolean:**
```yaml
input_boolean:
  calendar_notifications:
    name: Calendar Notifications
    icon: mdi:calendar-alert
```

**Input Text:**
```yaml
input_text:
  cam_last_notification:
    name: Cam Last Notification Time
    max: 50
    
  enhy_last_notification:
    name: Enhy Last Notification Time
    max: 50
```

### Required Components

**Template Sensors:**
- Calendar State Manager sensor (for system health monitoring)
- Optional: Cam Filtered Events calendar
- Optional: Enhy Filtered Events calendar

**Scripts:**
- `script.send_notification_with_fallback`
- `script.update_current_notifications`
- `script.test_calendar_notifications`

**Automations:**
- Calendar Tomorrow Preview (18:00 trigger)
- Calendar Today Reminder (06:00 trigger)
- Calendar 15-Minute Warning
- Calendar Real-time Update
- Optional: 18:30 catch-up trigger

### Optional UI Components

**For Testing Dashboard:**
- Button card for manual test trigger
- Entities card showing helper states
- Markdown card for system status

### System Requirements

- Home Assistant 2024.1 or newer (for calendar trigger offset support)
- Companion App installed on all target devices
- Stable internet connection for calendar sync
- Proper timezone configuration in Home Assistant

-----

## Edge Cases & Solutions

### Timing Boundaries

- **Exact duration boundaries**: Events lasting exactly 23 or 47 hours use inclusive rules (≤23 = timed, 23-47 = all-day, ≥47 = multi-day)
- **Missing end times**: Default to 1-hour duration for classification
- **Late-added events**: Include a 18:30 "catch-up" trigger for events added after 18:00
- **Day boundary events**: Events starting 18:00-23:59 today are classified as "today" but appear in tomorrow's 18:00 notification

### Notification Integrity

- **Unique notification IDs**: Use format `calendar_{person}_{date}_{type}` (e.g., `calendar_cam_20250614_daily`)
- **Event tracking**: Use time-based duplicate prevention with minimal state storage in input_text entities
- **System restart recovery**: Re-check active notifications on Home Assistant startup using template sensor state
- **Cancellation handling**: Compare current calendar state with last notification time every 30 minutes

### Event Classification Fixes

- **All-day vs multi-day**: Check actual start/end times, not just calendar flags
- **Recurring events**: Treat each occurrence as a separate event with unique timestamp
- **Midnight spanning**: Events crossing midnight belong to the day they start
- **Missing data**: Gracefully handle events without start/end times using sensible defaults

### Failure Handling

- **Calendar offline**: Continue with available calendars, note missing ones in notification
- **Notification service failure**: Retry with exponential backoff (15s, 30s, 60s)
- **Network issues**: Queue notifications locally until connectivity restored
- **Time zone changes**: Automatically recalculate all times using `now()` function

### Enhanced Carryover Logic

- **18:00 boundary**: Events starting 17:45-18:15 are considered "boundary events" and appear in both today's late notification and tomorrow's preview
- **Midnight rollover**: Events ending after midnight are tracked until completion
- **Duplicate prevention**: Use time-based logic rather than hash tracking due to input_text 255-character limit

### Privacy Enhancements

- **Calendar validation**: Verify calendar ownership before including in notifications
- **Shared calendar handling**: `calendar.both` events appear for both users but only from shared calendar
- **Error isolation**: Personal calendar failures don't affect the other person's notifications

### Recommended Storage Implementation

```yaml
# Minimal timestamp tracking (well under 255 char limit)
input_text:
  cam_last_notification:
    max: 50
    # Store: "2025-06-14T18:00:00"
    
  enhy_last_notification:
    max: 50
    # Store: "2025-06-14T18:00:00"

# Rich state storage via sensor attributes (unlimited)
template:
  - sensor:
      - name: "Calendar State Manager"
        state: "{{ now().strftime('%Y-%m-%d') }}"
        availability: >
          {{ is_state('calendar.cam', ['on', 'off']) and 
             is_state('calendar.enhy', ['on', 'off']) and
             is_state('calendar.both', ['on', 'off']) }}
        attributes:
          cam_daily_state: >
            # Store: {"sent": true, "carryover_events": [...], "last_cleanup": "18:00"}
          enhy_daily_state: >
            # Store: {"sent": true, "carryover_events": [...], "last_cleanup": "18:00"}
          system_health: >
            # Track calendar availability, network status, etc.
          last_system_check: "{{ now().isoformat() }}"

# Duplicate prevention using time-based conditions
automation:
  - condition: template
    value_template: >
      {% set last_run = states('input_text.cam_last_notification') %}
      {% set last_timestamp = last_run | as_timestamp %}
      {% set six_hours_ago = (now() - timedelta(hours=6)) | as_timestamp %}
      {{ last_timestamp < six_hours_ago }}
```

### Critical Implementation Guards

**Template Filter Protection:**

```yaml
# Prevent Jinja crashes when calendars return None
template:
  - calendar:
      - name: "Cam Filtered Events"
        events: >
          {% set events = namespace(list=[]) %}
          {% for state in states.calendar %}
            {% if state.attributes and state.attributes.items and 
                   state.entity_id in ['calendar.cam', 'calendar.both', 'calendar.special_day', 'calendar.united_kingdom_eng'] %}
              {% set events.list = events.list + state.attributes.items %}
            {% endif %}
          {% endfor %}
          {{ events.list }}
```

**Extended Preview Window:**

```yaml
# Fix late-night event timing gap
# Include events starting before 04:00 next day in 18:00 preview
automation:
  - alias: "Calendar Tomorrow Preview"
    trigger:
      - platform: time
        at: "18:00:00"
    action:
      - variables:
          preview_end: "{{ (now() + timedelta(days=1)).replace(hour=4, minute=0, second=0) }}"
          # Captures events until 04:00 next day, not just midnight
```

**Network Resilience Pattern:**

```yaml
script:
  send_notification_with_fallback:
    sequence:
      # Primary: Mobile push notification
      - continue_on_error: true
        service: notify.mobile_app_phone_c
        data:
          title: "{{ title }}"
          message: "{{ message }}"
      
      # Fallback: Always create persistent notification
      - service: persistent_notification.create
        data:
          title: "{{ title }}"
          notification_id: "calendar_{{ person }}_fallback"
          message: "{{ message }}"
          # Ensures user sees notification when reconnecting
```

### Enhanced Implementation Patterns

**Calendar Trigger for 15-Minute Notifications:**

```yaml
automation:
  - alias: "Calendar 15-Minute Warning"
    trigger:
      - platform: calendar
        entity_id: calendar.cam
        event: start
        offset: "-0:15:00"
      - platform: calendar
        entity_id: calendar.enhy  
        event: start
        offset: "-0:15:00"
    # Much cleaner than manual time calculations, handles DST automatically
```

**Privacy Filtering via Template Calendars:**

```yaml
template:
  - calendar:
      - name: "Cam Filtered Events"
        unique_id: cam_filtered_events
        events: >
          {% set events = namespace(list=[]) %}
          {% for state in states.calendar %}
            {% if state.entity_id in ['calendar.cam', 'calendar.both', 'calendar.special_day', 'calendar.united_kingdom_eng'] %}
              {% set events.list = events.list + state.attributes.items %}
            {% endif %}
          {% endfor %}
          {{ events.list }}
      - name: "Enhy Filtered Events"  
        unique_id: enhy_filtered_events
        events: >
          # Filter for Enhy's allowed calendars only
```

**Dynamic Re-render on Calendar Changes:**

```yaml
automation:
  - alias: "Calendar Real-time Update"
    trigger:
      - platform: state
        entity_id:
          - calendar.cam
          - calendar.enhy
          - calendar.both
          - calendar.special_day
          - calendar.united_kingdom_eng
    action:
      - service: script.update_current_notifications
        # Automatically refresh notifications when calendar state changes
        # Eliminates need for catch-up windows
```

**Persistent Notification State Management:**

```yaml
script:
  update_notification:
    sequence:
      - service: persistent_notification.create
        data:
          title: "{{ title }}"
          notification_id: "calendar_{{ person }}_daily"  # Reusable entity ID
          message: "{{ message }}"
      # Can update/dismiss programmatically via entity_id
```