# Calendar Notification System - Implementation Plan

**Hybrid approach combining clean architecture with comprehensive edge case handling**

## Prerequisites

| Requirement | Purpose | Status |
|-------------|---------|--------|
| Home Assistant ≥ 2024.1 | Calendar trigger offset support | [ ] |
| Companion App on all devices | Push notification delivery | [ ] |
| Calendar integrations active | Source entities exist | [ ] |
| Stable timezone configuration | Prevents time drift issues | [ ] |

**Required calendar entities:**
- `calendar.cam`, `calendar.enhy`, `calendar.both`
- `calendar.special_day`, `calendar.united_kingdom_eng`

**Required notification services:**
- `notify.mobile_app_phone_c`, `notify.mobile_app_phone_e`, `notify.mobile_app_ipad`

---

## PHASE 1: Foundation Architecture

### Step 1: Input Helpers with Validation

```yaml
# /config/packages/calendar_notifications.yaml
input_boolean:
  calendar_notifications:
    name: Calendar Notifications
    icon: mdi:calendar-alert

input_text:
  cam_last_notification:
    name: Cam Last Notification Time
    max: 50
    
  enhy_last_notification:
    name: Enhy Last Notification Time
    max: 50

# System health validation
template:
  - binary_sensor:
      - name: "Calendar System Health"
        unique_id: calendar_system_health
        state: >
          {% set required_calendars = ['calendar.cam', 'calendar.enhy', 'calendar.both', 'calendar.special_day', 'calendar.united_kingdom_eng'] %}
          {% set required_services = ['notify.mobile_app_phone_c', 'notify.mobile_app_phone_e', 'notify.mobile_app_ipad'] %}
          {% set calendar_count = required_calendars | select('has_value') | list | length %}
          {% set service_count = required_services | select('has_value') | list | length %}
          {{ calendar_count == 5 and service_count == 3 }}
        attributes:
          missing_calendars: >
            {% set required = ['calendar.cam', 'calendar.enhy', 'calendar.both', 'calendar.special_day', 'calendar.united_kingdom_eng'] %}
            {{ required | reject('has_value') | list }}
          missing_services: >
            {% set required = ['notify.mobile_app_phone_c', 'notify.mobile_app_phone_e', 'notify.mobile_app_ipad'] %}
            {{ required | reject('has_value') | list }}
```

**Test**: Toggle boolean, set text values, verify health sensor shows `on`.

### Step 2: Shared Event Processing Macros

```yaml
template:
  - sensor:
      - name: "Calendar Event Processor"
        unique_id: calendar_event_processor
        state: "{{ now().date() }}"
        scan_interval: 300  # Limit updates to every 5 minutes
        attributes:
          version: "1.0"
          last_update: "{{ now().isoformat() }}"
```

**Test**: Verify processor sensor exists and updates.

---

## PHASE 2: Privacy-Filtered Template Calendars

### Step 3: Template Calendar Implementation

```yaml
template:
  - calendar:
      - name: "Cam Filtered Events"
        unique_id: cam_filtered_events
        events: >
          {% set all_events = [] %}
          {% set allowed_cals = ['calendar.cam', 'calendar.both', 'calendar.special_day', 'calendar.united_kingdom_eng'] %}
          {% for cal_id in allowed_cals %}
            {% if states(cal_id) not in ['unavailable', 'unknown'] %}
              {% set cal_events = state_attr(cal_id, 'events') or [] %}
              {% for event in cal_events %}
                {% set event_with_source = event.copy() %}
                {% set _ = event_with_source.update({'source_calendar': cal_id}) %}
                {% set all_events = all_events + [event_with_source] %}
              {% endfor %}
            {% endif %}
          {% endfor %}
          {{ all_events }}

      - name: "Enhy Filtered Events"
        unique_id: enhy_filtered_events
        events: >
          {% set all_events = [] %}
          {% set allowed_cals = ['calendar.enhy', 'calendar.both', 'calendar.special_day', 'calendar.united_kingdom_eng'] %}
          {% for cal_id in allowed_cals %}
            {% if states(cal_id) not in ['unavailable', 'unknown'] %}
              {% set cal_events = state_attr(cal_id, 'events') or [] %}
              {% for event in cal_events %}
                {% set event_with_source = event.copy() %}
                {% set _ = event_with_source.update({'source_calendar': cal_id}) %}
                {% set all_events = all_events + [event_with_source] %}
              {% endfor %}
            {% endif %}
          {% endfor %}
          {{ all_events }}
```

**Test**: Verify each filtered calendar shows only appropriate events and includes source calendar tracking.

---

## PHASE 3: Event Processing & Formatting

### Step 4: Consolidated Digest Sensors with Timezone Handling

```yaml
template:
  - sensor:
      - name: "Cam Daily Digest"
        unique_id: cam_daily_digest
        state: "{{ now().date() }}"
        scan_interval: 300
        availability: "{{ state_attr('calendar.cam_filtered_events', 'events') is not none }}"
        attributes:
          today_lines: >
            {% macro dur_class(ev) -%}
              {%- set start = ev.start | as_datetime -%}
              {%- set end = ev.end | as_datetime(default=start + timedelta(hours=1)) -%}
              {%- set duration_hours = ((end.astimezone() - start.astimezone()).total_seconds() / 3600) | int -%}
              {{- 'timed' if duration_hours < 23 else 'all_day' if duration_hours <= 47 else 'multi_day' -}}
            {%- endmacro %}
            
            {% macro format_event(ev, target_date) -%}
              {%- set cls = dur_class(ev) -%}
              {%- set start = ev.start | as_datetime -%}
              {%- set end = ev.end | as_datetime -%}
              
              {%- if cls == 'timed' -%}
                {%- set time_str = ' (' + start.strftime('%H:%M') + ')' -%}
              {%- else -%}
                {%- set time_str = '' -%}
              {%- endif -%}
              
              {%- set source = ev.get('source_calendar', '') -%}
              {%- if 'calendar.cam' in source -%}
                {%- set icon = '👤 Cam: ' -%}
              {%- elif 'calendar.enhy' in source -%}
                {%- set icon = '👤 Enhy: ' -%}
              {%- elif 'calendar.both' in source -%}
                {%- set icon = '👥 Both: ' -%}
              {%- else -%}
                {%- set icon = 'ℹ️ Info: ' -%}
              {%- endif -%}
              
              {%- if cls == 'multi_day' -%}
                {%- set event_start_date = start.date() -%}
                {%- set event_end_date = end.date() -%}
                {%- set total_days = (event_end_date - event_start_date).days + 1 -%}
                {%- if target_date == event_start_date -%}
                  {%- set day_indicator = ' (Day 1 of ' + total_days|string + ')' -%}
                {%- elif target_date == event_end_date -%}
                  {%- set day_indicator = ' (Final day)' -%}
                {%- else -%}
                  {%- set day_indicator = '' -%}
                {%- endif -%}
              {%- else -%}
                {%- set day_indicator = '' -%}
              {%- endif -%}
              
              {{- icon + (ev.summary | default('Untitled Event')) + time_str + day_indicator -}}
            {%- endmacro %}
            
            {% set today = now().date() %}
            {% set today_start = now().replace(hour=0, minute=0, second=0, microsecond=0) %}
            {% set today_end = today_start + timedelta(days=1) %}
            {% set events = state_attr('calendar.cam_filtered_events', 'events') or [] %}
            {% set today_events = [] %}
            
            {% for ev in events %}
              {% set ev_start = ev.start | as_datetime %}
              {% set ev_end = ev.end | as_datetime %}
              {% if ev_start < today_end and ev_end > today_start %}
                {% set today_events = today_events + [ev] %}
              {% endif %}
            {% endfor %}
            
            {% set lines = [] %}
            {% for ev in today_events %}
              {% set lines = lines + [format_event(ev, today)] %}
            {% endfor %}
            {{ lines }}
            
          tomorrow_lines: >
            {% macro dur_class(ev) -%}
              {%- set start = ev.start | as_datetime -%}
              {%- set end = ev.end | as_datetime(default=start + timedelta(hours=1)) -%}
              {%- set duration_hours = ((end.astimezone() - start.astimezone()).total_seconds() / 3600) | int -%}
              {{- 'timed' if duration_hours < 23 else 'all_day' if duration_hours <= 47 else 'multi_day' -}}
            {%- endmacro %}
            
            {% macro format_event(ev, target_date) -%}
              {%- set cls = dur_class(ev) -%}
              {%- set start = ev.start | as_datetime -%}
              {%- set end = ev.end | as_datetime -%}
              
              {%- if cls == 'timed' -%}
                {%- set time_str = ' (' + start.strftime('%H:%M') + ')' -%}
              {%- else -%}
                {%- set time_str = '' -%}
              {%- endif -%}
              
              {%- set source = ev.get('source_calendar', '') -%}
              {%- if 'calendar.cam' in source -%}
                {%- set icon = '👤 Cam: ' -%}
              {%- elif 'calendar.enhy' in source -%}
                {%- set icon = '👤 Enhy: ' -%}
              {%- elif 'calendar.both' in source -%}
                {%- set icon = '👥 Both: ' -%}
              {%- else -%}
                {%- set icon = 'ℹ️ Info: ' -%}
              {%- endif -%}
              
              {%- if cls == 'multi_day' -%}
                {%- set event_start_date = start.date() -%}
                {%- set event_end_date = end.date() -%}
                {%- set total_days = (event_end_date - event_start_date).days + 1 -%}
                {%- if target_date == event_start_date -%}
                  {%- set day_indicator = ' (Day 1 of ' + total_days|string + ')' -%}
                {%- elif target_date == event_end_date -%}
                  {%- set day_indicator = ' (Final day)' -%}
                {%- else -%}
                  {%- set day_indicator = '' -%}
                {%- endif -%}
              {%- else -%}
                {%- set day_indicator = '' -%}
              {%- endif -%}
              
              {{- icon + (ev.summary | default('Untitled Event')) + time_str + day_indicator -}}
            {%- endmacro %}
            
            {% set tomorrow = (now() + timedelta(days=1)).date() %}
            {% set tomorrow_start = (now() + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0) %}
            {% set tomorrow_end = (now() + timedelta(days=1)).replace(hour=4, minute=0, second=0, microsecond=0) %}
            {% set events = state_attr('calendar.cam_filtered_events', 'events') or [] %}
            {% set tomorrow_events = [] %}
            
            {% for ev in events %}
              {% set ev_start = ev.start | as_datetime %}
              {% set ev_end = ev.end | as_datetime %}
              {% if ev_start < tomorrow_end and ev_end > tomorrow_start %}
                {% set tomorrow_events = tomorrow_events + [ev] %}
              {% endif %}
            {% endfor %}
            
            {% set lines = [] %}
            {% for ev in tomorrow_events %}
              {% set lines = lines + [format_event(ev, tomorrow)] %}
            {% endfor %}
            {{ lines }}
            
          carryover_events: >
            {% set now_time = now() %}
            {% set events = state_attr('calendar.cam_filtered_events', 'events') or [] %}
            {% set active_events = [] %}
            
            {% for ev in events %}
              {% set ev_start = ev.start | as_datetime %}
              {% set ev_end = ev.end | as_datetime %}
              {% set duration_hours = ((ev_end.astimezone() - ev_start.astimezone()).total_seconds() / 3600) | int %}
              
              {% if duration_hours < 23 and ev_start <= now_time < ev_end %}
                {% set time_display = ev_end.strftime('%a %H:%M') if ev_end.date() != now_time.date() else ev_end.strftime('%H:%M') %}
                {% set active_events = active_events + [(ev.summary | default('Untitled Event')) + ' (until ' + time_display + ')'] %}
              {% endif %}
            {% endfor %}
            {{ active_events }}

      - name: "Enhy Daily Digest"
        unique_id: enhy_daily_digest
        state: "{{ now().date() }}"
        scan_interval: 300
        availability: "{{ state_attr('calendar.enhy_filtered_events', 'events') is not none }}"
        attributes:
          today_lines: >
            {% macro dur_class(ev) -%}
              {%- set start = ev.start | as_datetime -%}
              {%- set end = ev.end | as_datetime(default=start + timedelta(hours=1)) -%}
              {%- set duration_hours = ((end.astimezone() - start.astimezone()).total_seconds() / 3600) | int -%}
              {{- 'timed' if duration_hours < 23 else 'all_day' if duration_hours <= 47 else 'multi_day' -}}
            {%- endmacro %}
            
            {% macro format_event(ev, target_date) -%}
              {%- set cls = dur_class(ev) -%}
              {%- set start = ev.start | as_datetime -%}
              {%- set end = ev.end | as_datetime -%}
              
              {%- if cls == 'timed' -%}
                {%- set time_str = ' (' + start.strftime('%H:%M') + ')' -%}
              {%- else -%}
                {%- set time_str = '' -%}
              {%- endif -%}
              
              {%- set source = ev.get('source_calendar', '') -%}
              {%- if 'calendar.enhy' in source -%}
                {%- set icon = '👤 Enhy: ' -%}
              {%- elif 'calendar.cam' in source -%}
                {%- set icon = '👤 Cam: ' -%}
              {%- elif 'calendar.both' in source -%}
                {%- set icon = '👥 Both: ' -%}
              {%- else -%}
                {%- set icon = 'ℹ️ Info: ' -%}
              {%- endif -%}
              
              {%- if cls == 'multi_day' -%}
                {%- set event_start_date = start.date() -%}
                {%- set event_end_date = end.date() -%}
                {%- set total_days = (event_end_date - event_start_date).days + 1 -%}
                {%- if target_date == event_start_date -%}
                  {%- set day_indicator = ' (Day 1 of ' + total_days|string + ')' -%}
                {%- elif target_date == event_end_date -%}
                  {%- set day_indicator = ' (Final day)' -%}
                {%- else -%}
                  {%- set day_indicator = '' -%}
                {%- endif -%}
              {%- else -%}
                {%- set day_indicator = '' -%}
              {%- endif -%}
              
              {{- icon + (ev.summary | default('Untitled Event')) + time_str + day_indicator -}}
            {%- endmacro %}
            
            {% set today = now().date() %}
            {% set today_start = now().replace(hour=0, minute=0, second=0, microsecond=0) %}
            {% set today_end = today_start + timedelta(days=1) %}
            {% set events = state_attr('calendar.enhy_filtered_events', 'events') or [] %}
            {% set today_events = [] %}
            
            {% for ev in events %}
              {% set ev_start = ev.start | as_datetime %}
              {% set ev_end = ev.end | as_datetime %}
              {% if ev_start < today_end and ev_end > today_start %}
                {% set today_events = today_events + [ev] %}
              {% endif %}
            {% endfor %}
            
            {% set lines = [] %}
            {% for ev in today_events %}
              {% set lines = lines + [format_event(ev, today)] %}
            {% endfor %}
            {{ lines }}
            
          tomorrow_lines: >
            {# Same implementation as Cam but for Enhy events #}
            {% macro dur_class(ev) -%}
              {%- set start = ev.start | as_datetime -%}
              {%- set end = ev.end | as_datetime(default=start + timedelta(hours=1)) -%}
              {%- set duration_hours = ((end.astimezone() - start.astimezone()).total_seconds() / 3600) | int -%}
              {{- 'timed' if duration_hours < 23 else 'all_day' if duration_hours <= 47 else 'multi_day' -}}
            {%- endmacro %}
            
            {% macro format_event(ev, target_date) -%}
              {%- set cls = dur_class(ev) -%}
              {%- set start = ev.start | as_datetime -%}
              {%- set end = ev.end | as_datetime -%}
              
              {%- if cls == 'timed' -%}
                {%- set time_str = ' (' + start.strftime('%H:%M') + ')' -%}
              {%- else -%}
                {%- set time_str = '' -%}
              {%- endif -%}
              
              {%- set source = ev.get('source_calendar', '') -%}
              {%- if 'calendar.enhy' in source -%}
                {%- set icon = '👤 Enhy: ' -%}
              {%- elif 'calendar.cam' in source -%}
                {%- set icon = '👤 Cam: ' -%}
              {%- elif 'calendar.both' in source -%}
                {%- set icon = '👥 Both: ' -%}
              {%- else -%}
                {%- set icon = 'ℹ️ Info: ' -%}
              {%- endif -%}
              
              {%- if cls == 'multi_day' -%}
                {%- set event_start_date = start.date() -%}
                {%- set event_end_date = end.date() -%}
                {%- set total_days = (event_end_date - event_start_date).days + 1 -%}
                {%- if target_date == event_start_date -%}
                  {%- set day_indicator = ' (Day 1 of ' + total_days|string + ')' -%}
                {%- elif target_date == event_end_date -%}
                  {%- set day_indicator = ' (Final day)' -%}
                {%- else -%}
                  {%- set day_indicator = '' -%}
                {%- endif -%}
              {%- else -%}
                {%- set day_indicator = '' -%}
              {%- endif -%}
              
              {{- icon + (ev.summary | default('Untitled Event')) + time_str + day_indicator -}}
            {%- endmacro %}
            
            {% set tomorrow = (now() + timedelta(days=1)).date() %}
            {% set tomorrow_start = (now() + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0) %}
            {% set tomorrow_end = (now() + timedelta(days=1)).replace(hour=4, minute=0, second=0, microsecond=0) %}
            {% set events = state_attr('calendar.enhy_filtered_events', 'events') or [] %}
            {% set tomorrow_events = [] %}
            
            {% for ev in events %}
              {% set ev_start = ev.start | as_datetime %}
              {% set ev_end = ev.end | as_datetime %}
              {% if ev_start < tomorrow_end and ev_end > tomorrow_start %}
                {% set tomorrow_events = tomorrow_events + [ev] %}
              {% endif %}
            {% endfor %}
            
            {% set lines = [] %}
            {% for ev in tomorrow_events %}
              {% set lines = lines + [format_event(ev, tomorrow)] %}
            {% endfor %}
            {{ lines }}
            
          carryover_events: >
            {% set now_time = now() %}
            {% set events = state_attr('calendar.enhy_filtered_events', 'events') or [] %}
            {% set active_events = [] %}
            
            {% for ev in events %}
              {% set ev_start = ev.start | as_datetime %}
              {% set ev_end = ev.end | as_datetime %}
              {% set duration_hours = ((ev_end.astimezone() - ev_start.astimezone()).total_seconds() / 3600) | int %}
              
              {% if duration_hours < 23 and ev_start <= now_time < ev_end %}
                {% set time_display = ev_end.strftime('%a %H:%M') if ev_end.date() != now_time.date() else ev_end.strftime('%H:%M') %}
                {% set active_events = active_events + [(ev.summary | default('Untitled Event')) + ' (until ' + time_display + ')'] %}
              {% endif %}
            {% endfor %}
            {{ active_events }}
```

**Test**: Check sensor attributes show properly formatted event lines with timezone handling.

---

## PHASE 4: Robust Multi-Device Notification Scripts

### Step 5: Notification Scripts with Retry Logic

```yaml
script:
  push_cam:
    alias: "Send Notification to Cam"
    mode: restart
    icon: mdi:account-arrow-right
    fields:
      title: {description: "Notification title"}
      message: {description: "Notification body"}
      tag: {description: "Notification tag", default: "calendar"}
    sequence:
      - condition: state
        entity_id: binary_sensor.calendar_system_health
        state: "on"
      - variables:
          notification_id: "calendar_cam_{{ tag }}_{{ now().strftime('%Y%m%d') }}"
          retry_count: 0
      - repeat:
          while:
            - condition: template
              value_template: "{{ retry_count < 3 }}"
          sequence:
            - parallel:
                - sequence:
                    - service: notify.mobile_app_phone_c
                      data:
                        title: "{{ title }}"
                        message: "{{ message }}"
                        data:
                          tag: "{{ tag }}"
                          persistent: true
                          notification_icon: "mdi:calendar"
                      continue_on_error: true
                - sequence:
                    - service: notify.mobile_app_ipad
                      data:
                        title: "{{ title }}"
                        message: "{{ message }}"
                        data:
                          tag: "{{ tag }}"
                          persistent: true
                          notification_icon: "mdi:calendar"
                      continue_on_error: true
            - service: persistent_notification.create
              data:
                notification_id: "{{ notification_id }}"
                title: "{{ title }}"
                message: "{{ message }}"
            - variables:
                retry_count: "{{ retry_count + 1 }}"
            - if:
                - condition: template
                  value_template: "{{ retry_count < 3 }}"
              then:
                - delay: "00:00:{{ 15 * retry_count }}"

  push_enhy:
    alias: "Send Notification to Enhy"
    mode: restart
    icon: mdi:account-arrow-right
    fields:
      title: {description: "Notification title"}
      message: {description: "Notification body"}
      tag: {description: "Notification tag", default: "calendar"}
    sequence:
      - condition: state
        entity_id: binary_sensor.calendar_system_health
        state: "on"
      - variables:
          notification_id: "calendar_enhy_{{ tag }}_{{ now().strftime('%Y%m%d') }}"
          retry_count: 0
      - repeat:
          while:
            - condition: template
              value_template: "{{ retry_count < 3 }}"
          sequence:
            - parallel:
                - sequence:
                    - service: notify.mobile_app_phone_e
                      data:
                        title: "{{ title }}"
                        message: "{{ message }}"
                        data:
                          tag: "{{ tag }}"
                          persistent: true
                          notification_icon: "mdi:calendar"
                      continue_on_error: true
                - sequence:
                    - service: notify.mobile_app_ipad
                      data:
                        title: "{{ title }}"
                        message: "{{ message }}"
                        data:
                          tag: "{{ tag }}"
                          persistent: true
                          notification_icon: "mdi:calendar"
                      continue_on_error: true
            - service: persistent_notification.create
              data:
                notification_id: "{{ notification_id }}"
                title: "{{ title }}"
                message: "{{ message }}"
            - variables:
                retry_count: "{{ retry_count + 1 }}"
            - if:
                - condition: template
                  value_template: "{{ retry_count < 3 }}"
              then:
                - delay: "00:00:{{ 15 * retry_count }}"

  clear_calendar_notifications:
    alias: "Clear Calendar Notifications"
    mode: parallel
    fields:
      person: {description: "Person (cam/enhy)", example: "cam"}
      tag: {description: "Notification tag", default: "calendar"}
    sequence:
      - choose:
          - conditions:
              - condition: template
                value_template: "{{ person == 'cam' }}"
            sequence:
              - parallel:
                  - service: notify.mobile_app_phone_c
                    data:
                      message: "clear_notification"
                      data:
                        tag: "{{ tag }}"
                    continue_on_error: true
                  - service: notify.mobile_app_ipad
                    data:
                      message: "clear_notification"
                      data:
                        tag: "{{ tag }}"
                    continue_on_error: true
                  - service: persistent_notification.dismiss
                    data:
                      notification_id: "calendar_cam_{{ tag }}_{{ now().strftime('%Y%m%d') }}"
                    continue_on_error: true
          - conditions:
              - condition: template
                value_template: "{{ person == 'enhy' }}"
            sequence:
              - parallel:
                  - service: notify.mobile_app_phone_e
                    data:
                      message: "clear_notification"
                      data:
                        tag: "{{ tag }}"
                    continue_on_error: true
                  - service: notify.mobile_app_ipad
                    data:
                      message: "clear_notification"
                      data:
                        tag: "{{ tag }}"
                    continue_on_error: true
                  - service: persistent_notification.dismiss
                    data:
                      notification_id: "calendar_enhy_{{ tag }}_{{ now().strftime('%Y%m%d') }}"
                    continue_on_error: true
```

**Test**: Call scripts manually with test data, verify retry logic and error handling.

---

## PHASE 5: Core Automations with Error Handling

### Step 6: Morning Notifications (06:00) with Validation

```yaml
automation:
  - alias: "Calendar Morning Reminder"
    id: calendar_morning_reminder
    trigger:
      - platform: time
        at: "06:00:00"
    condition:
      - condition: state
        entity_id: input_boolean.calendar_notifications
        state: "on"
      - condition: state
        entity_id: binary_sensor.calendar_system_health
        state: "on"
    action:
      - parallel:
          - sequence:
              - condition: template
                value_template: >
                  {% set last = states('input_text.cam_last_notification') %}
                  {% if last in ['unknown', '', 'unavailable'] %}
                    true
                  {% else %}
                    {% set last_time = last | as_datetime %}
                    {% if last_time is none %}
                      true
                    {% else %}
                      {{ last_time < (now() - timedelta(hours=6)) }}
                    {% endif %}
                  {% endif %}
              - variables:
                  lines: "{{ state_attr('sensor.cam_daily_digest', 'today_lines') or [] }}"
                  carryover: "{{ state_attr('sensor.cam_daily_digest', 'carryover_events') or [] }}"
                  all_lines: "{{ (carryover + lines) if carryover else lines }}"
              - condition: template
                value_template: "{{ all_lines | length > 0 }}"
              - service: script.push_cam
                data:
                  title: "Calendar Reminder"
                  message: >
                    📅 Today ({{ now().strftime('%d %b') }})
                    {{ all_lines | join('\n') }}
                  tag: "daily"
              - service: input_text.set_value
                target:
                  entity_id: input_text.cam_last_notification
                data:
                  value: "{{ now().isoformat() }}"
          - sequence:
              - condition: template
                value_template: >
                  {% set last = states('input_text.enhy_last_notification') %}
                  {% if last in ['unknown', '', 'unavailable'] %}
                    true
                  {% else %}
                    {% set last_time = last | as_datetime %}
                    {% if last_time is none %}
                      true
                    {% else %}
                      {{ last_time < (now() - timedelta(hours=6)) }}
                    {% endif %}
                  {% endif %}
              - variables:
                  lines: "{{ state_attr('sensor.enhy_daily_digest', 'today_lines') or [] }}"
                  carryover: "{{ state_attr('sensor.enhy_daily_digest', 'carryover_events') or [] }}"
                  all_lines: "{{ (carryover + lines) if carryover else lines }}"
              - condition: template
                value_template: "{{ all_lines | length > 0 }}"
              - service: script.push_enhy
                data:
                  title: "Calendar Reminder"
                  message: >
                    📅 Today ({{ now().strftime('%d %b') }})
                    {{ all_lines | join('\n') }}
                  tag: "daily"
              - service: input_text.set_value
                target:
                  entity_id: input_text.enhy_last_notification
                data:
                  value: "{{ now().isoformat() }}"
```

### Step 7: Evening Preview (18:00) with Cleanup

```yaml
automation:
  - alias: "Calendar Evening Preview"
    id: calendar_evening_preview
    trigger:
      - platform: time
        at: "18:00:00"
    condition:
      - condition: state
        entity_id: input_boolean.calendar_notifications
        state: "on"
      - condition: state
        entity_id: binary_sensor.calendar_system_health
        state: "on"
    action:
      - parallel:
          - sequence:
              - variables:
                  lines: "{{ state_attr('sensor.cam_daily_digest', 'tomorrow_lines') or [] }}"
              - condition: template
                value_template: "{{ lines | length > 0 }}"
              - service: script.push_cam
                data:
                  title: "Calendar Preview"
                  message: >
                    📅 Tomorrow ({{ (now() + timedelta(days=1)).strftime('%d %b') }})
                    {{ lines | join('\n') }}
                  tag: "daily"
          - sequence:
              - variables:
                  lines: "{{ state_attr('sensor.enhy_daily_digest', 'tomorrow_lines') or [] }}"
              - condition: template
                value_template: "{{ lines | length > 0 }}"
              - service: script.push_enhy
                data:
                  title: "Calendar Preview"
                  message: >
                    📅 Tomorrow ({{ (now() + timedelta(days=1)).strftime('%d %b') }})
                    {{ lines | join('\n') }}
                  tag: "daily"
      # Enhanced cleanup with validation
      - delay: "00:00:10"
      - parallel:
          - sequence:
              - variables:
                  cam_carryover: "{{ state_attr('sensor.cam_daily_digest', 'carryover_events') or [] }}"
              - condition: template
                value_template: "{{ cam_carryover | length == 0 }}"
              - service: script.clear_calendar_notifications
                data:
                  person: "cam"
                  tag: "daily"
          - sequence:
              - variables:
                  enhy_carryover: "{{ state_attr('sensor.enhy_daily_digest', 'carryover_events') or [] }}"
              - condition: template
                value_template: "{{ enhy_carryover | length == 0 }}"
              - service: script.clear_calendar_notifications
                data:
                  person: "enhy"
                  tag: "daily"
```

### Step 8: 15-Minute Warnings with Calendar Triggers

```yaml
automation:
  - alias: "Calendar 15-Minute Warning"
    id: calendar_15min_warning
    trigger:
      - platform: calendar
        entity_id: calendar.cam_filtered_events
        event: start
        offset: "-0:15:00"
      - platform: calendar
        entity_id: calendar.enhy_filtered_events
        event: start
        offset: "-0:15:00"
    condition:
      - condition: state
        entity_id: input_boolean.calendar_notifications
        state: "on"
      - condition: state
        entity_id: binary_sensor.calendar_system_health
        state: "on"
      - condition: template
        value_template: >
          {% set event_start = as_timestamp(trigger.calendar_event.start) %}
          {% set event_end = as_timestamp(trigger.calendar_event.end) %}
          {% set duration_hours = (event_end - event_start) / 3600 %}
          {{ duration_hours < 23 }}
      - condition: time
        after: "06:00:00"
        before: "22:00:00"
    action:
      - choose:
          - conditions:
              - condition: template
                value_template: "{{ trigger.entity_id == 'calendar.cam_filtered_events' }}"
            sequence:
              - service: script.push_cam
                data:
                  title: "⏰ Starting in 15 minutes"
                  message: "{{ trigger.calendar_event.summary }} ({{ as_timestamp(trigger.calendar_event.start) | timestamp_custom('%H:%M') }})"
                  tag: "warning"
          - conditions:
              - condition: template
                value_template: "{{ trigger.entity_id == 'calendar.enhy_filtered_events' }}"
            sequence:
              - service: script.push_enhy
                data:
                  title: "⏰ Starting in 15 minutes"
                  message: "{{ trigger.calendar_event.summary }} ({{ as_timestamp(trigger.calendar_event.start) | timestamp_custom('%H:%M') }})"
                  tag: "warning"
```

**Test**: Create test events 16 minutes in future and verify triggers fire correctly.

---

## PHASE 6: Resilience & System Recovery

### Step 9: System Monitoring and Auto-Recovery

```yaml
automation:
  - alias: "Calendar System Health Check"
    id: calendar_system_health_check
    trigger:
      - platform: homeassistant
        event: start
      - platform: time_pattern
        hours: "*"
        minutes: "0"
    action:
      - condition: state
        entity_id: input_boolean.calendar_notifications
        state: "on"
      - if:
          - condition: state
            entity_id: binary_sensor.calendar_system_health
            state: "off"
        then:
          - service: persistent_notification.create
            data:
              notification_id: "calendar_system_error"
              title: "⚠️ Calendar System Error"
              message: >
                Missing components detected:
                Calendars: {{ state_attr('binary_sensor.calendar_system_health', 'missing_calendars') }}
                Services: {{ state_attr('binary_sensor.calendar_system_health', 'missing_services') }}
        else:
          - service: persistent_notification.dismiss
            data:
              notification_id: "calendar_system_error"
          - service: homeassistant.update_entity
            target:
              entity_id:
                - calendar.cam_filtered_events
                - calendar.enhy_filtered_events
                - sensor.cam_daily_digest
                - sensor.enhy_daily_digest

  - alias: "Calendar Notification Auto-Cleanup"
    id: calendar_notification_cleanup
    trigger:
      - platform: time_pattern
        minutes: "/30"
    condition:
      - condition: state
        entity_id: input_boolean.calendar_notifications
        state: "on"
      - condition: state
        entity_id: binary_sensor.calendar_system_health
        state: "on"
    action:
      - parallel:
          - sequence:
              - variables:
                  carryover: "{{ state_attr('sensor.cam_daily_digest', 'carryover_events') or [] }}"
              - condition: template
                value_template: "{{ carryover | length == 0 }}"
              - service: script.clear_calendar_notifications
                data:
                  person: "cam"
                  tag: "daily"
          - sequence:
              - variables:
                  carryover: "{{ state_attr('sensor.enhy_daily_digest', 'carryover_events') or [] }}"
              - condition: template
                value_template: "{{ carryover | length == 0 }}"
              - service: script.clear_calendar_notifications
                data:
                  person: "enhy"
                  tag: "daily"

  - alias: "Calendar Catch-Up Notification"
    id: calendar_catchup
    trigger:
      - platform: time
        at: "18:30:00"
    condition:
      - condition: state
        entity_id: input_boolean.calendar_notifications
        state: "on"
      - condition: state
        entity_id: binary_sensor.calendar_system_health
        state: "on"
    action:
      - parallel:
          - sequence:
              - variables:
                  lines: "{{ state_attr('sensor.cam_daily_digest', 'tomorrow_lines') or [] }}"
              - condition: template
                value_template: "{{ lines | length > 0 }}"
              - service: script.push_cam
                data:
                  title: "Calendar Update"
                  message: >
                    📅 Late Update - Tomorrow ({{ (now() + timedelta(days=1)).strftime('%d %b') }})
                    {{ lines | join('\n') }}
                  tag: "catchup"
          - sequence:
              - variables:
                  lines: "{{ state_attr('sensor.enhy_daily_digest', 'tomorrow_lines') or [] }}"
              - condition: template
                value_template: "{{ lines | length > 0 }}"
              - service: script.push_enhy
                data:
                  title: "Calendar Update"
                  message: >
                    📅 Late Update - Tomorrow ({{ (now() + timedelta(days=1)).strftime('%d %b') }})
                    {{ lines | join('\n') }}
                  tag: "catchup"

  - alias: "Calendar Real-Time Update"
    id: calendar_realtime_update
    trigger:
      - platform: state
        entity_id:
          - calendar.cam
          - calendar.enhy
          - calendar.both
          - calendar.special_day
          - calendar.united_kingdom_eng
    condition:
      - condition: state
        entity_id: input_boolean.calendar_notifications
        state: "on"
      - condition: time
        after: "06:00:00"
        before: "22:00:00"
    action:
      - delay: "00:02:00"
      - service: homeassistant.update_entity
        target:
          entity_id:
            - calendar.cam_filtered_events
            - calendar.enhy_filtered_events
            - sensor.cam_daily_digest
            - sensor.enhy_daily_digest
```

**Test**: Restart Home Assistant and verify system recovers automatically.

---

## PHASE 7: Testing & Monitoring

### Step 10: Test Framework

```yaml
script:
  test_calendar_notifications:
    alias: "Test Calendar Notifications"
    icon: mdi:test-tube
    sequence:
      - condition: state
        entity_id: binary_sensor.calendar_system_health
        state: "on"
      - service: script.push_cam
        data:
          title: "Calendar Test"
          message: |
            🧪 Test Cam - Today ({{ now().strftime('%d %b') }})
            👤 Cam: Test meeting ({{ (now() + timedelta(minutes=30)).strftime('%H:%M') }})
            👥 Both: Test lunch ({{ (now() + timedelta(hours=2)).strftime('%H:%M') }})
            ℹ️ Info: Test holiday
          tag: "test"
      - service: script.push_enhy
        data:
          title: "Calendar Test"
          message: |
            🧪 Test Enhy - Today ({{ now().strftime('%d %b') }})
            👤 Enhy: Test standup ({{ (now() + timedelta(minutes=45)).strftime('%H:%M') }})
            👥 Both: Test lunch ({{ (now() + timedelta(hours=2)).strftime('%H:%M') }})
            ℹ️ Info: Test holiday
          tag: "test"
      - service: persistent_notification.create
        data:
          notification_id: "calendar_test_complete"
          title: "🧪 Calendar Test Complete"
          message: >
            Test notifications sent to all devices. Check mobile apps and persistent notifications.
            System Health: {{ states('binary_sensor.calendar_system_health') }}

  test_timezone_boundaries:
    alias: "Test Timezone Boundary Cases"
    icon: mdi:clock-alert
    sequence:
      - service: persistent_notification.create
        data:
          notification_id: "timezone_test"
          title: "🕒 Timezone Test Results"
          message: >
            Current timezone: {{ now().strftime('%Z %z') }}
            23-hour boundary test: {{ (23 * 3600) < (24 * 3600) }}
            47-hour boundary test: {{ (47 * 3600) > (24 * 3600) }}
            Multi-day detection working: {{ (48 * 3600) >= (47 * 3600) }}

  clear_test_notifications:
    alias: "Clear Test Notifications"
    icon: mdi:notification-clear-all
    sequence:
      - parallel:
          - service: script.clear_calendar_notifications
            data:
              person: "cam"
              tag: "test"
          - service: script.clear_calendar_notifications
            data:
              person: "enhy"
              tag: "test"
          - service: persistent_notification.dismiss
            data:
              notification_id: "calendar_test_complete"
          - service: persistent_notification.dismiss
            data:
              notification_id: "timezone_test"
```

### Step 11: Monitoring Dashboard

```yaml
# Dashboard Configuration
type: vertical-stack
cards:
  - type: entities
    title: "Calendar Notification System Status"
    show_header_toggle: false
    entities:
      - entity: input_boolean.calendar_notifications
        name: "Notifications Enabled"
      - entity: binary_sensor.calendar_system_health
        name: "System Health"
        icon: mdi:heart-pulse
      - entity: sensor.calendar_event_processor
        name: "Event Processor"
      - entity: sensor.cam_daily_digest
        name: "Cam Digest State"
      - entity: sensor.enhy_daily_digest
        name: "Enhy Digest State"
      - entity: input_text.cam_last_notification
        name: "Cam Last Notification"
      - entity: input_text.enhy_last_notification
        name: "Enhy Last Notification"

  - type: conditional
    conditions:
      - entity: binary_sensor.calendar_system_health
        state: "off"
    card:
      type: markdown
      title: "⚠️ System Issues Detected"
      content: |
        **Missing Calendars:** {{ state_attr('binary_sensor.calendar_system_health', 'missing_calendars') | join(', ') }}
        **Missing Services:** {{ state_attr('binary_sensor.calendar_system_health', 'missing_services') | join(', ') }}

  - type: horizontal-stack
    cards:
      - type: button
        name: "Test Basic"
        tap_action:
          action: call-service
          service: script.test_calendar_notifications
        icon: mdi:test-tube
      - type: button
        name: "Test Timezone"
        tap_action:
          action: call-service
          service: script.test_timezone_boundaries
        icon: mdi:clock-alert
      - type: button
        name: "Clear Tests"
        tap_action:
          action: call-service
          service: script.clear_test_notifications
        icon: mdi:notification-clear-all

  - type: markdown
    content: |
      ## System Status
      **Health:** {{ 'HEALTHY' if is_state('binary_sensor.calendar_system_health', 'on') else 'DEGRADED' }}
      
      **Next Notifications:**
      - Morning: 06:00 ({{ (now().replace(hour=6, minute=0) + timedelta(days=1 if now().hour >= 6 else 0)).strftime('%a %d %b') }})
      - Evening: 18:00 ({{ (now().replace(hour=18, minute=0) + timedelta(days=1 if now().hour >= 18 else 0)).strftime('%a %d %b') }})
      
      **Active Calendars:** {{ states.calendar | selectattr('state', 'in', ['on', 'off']) | list | length }}
      
      **Today's Events:**
      {% set cam_lines = state_attr('sensor.cam_daily_digest', 'today_lines') or [] %}
      {% set enhy_lines = state_attr('sensor.enhy_daily_digest', 'today_lines') or [] %}
      - Cam: {{ cam_lines | length }}
      - Enhy: {{ enhy_lines | length }}
      
      **Performance:**
      - Last Processor Update: {{ state_attr('sensor.calendar_event_processor', 'last_update') | as_timestamp | timestamp_custom('%H:%M:%S') if state_attr('sensor.calendar_event_processor', 'last_update') else 'Never' }}
      - Template Calendar Status: {{ 'Available' if state_attr('calendar.cam_filtered_events', 'events') is not none else 'Unavailable' }}

  - type: conditional
    conditions:
      - entity: sensor.cam_daily_digest
        state_not: "unavailable"
    card:
      type: markdown
      title: "Cam Today Preview"
      content: |
        {% set lines = state_attr('sensor.cam_daily_digest', 'today_lines') or [] %}
        {% if lines | length > 0 %}
        {{ lines | join('\n') }}
        {% else %}
        No events today
        {% endif %}

  - type: conditional
    conditions:
      - entity: sensor.enhy_daily_digest
        state_not: "unavailable"
    card:
      type: markdown
      title: "Enhy Today Preview"
      content: |
        {% set lines = state_attr('sensor.enhy_daily_digest', 'today_lines') or [] %}
        {% if lines | length > 0 %}
        {{ lines | join('\n') }}
        {% else %}
        No events today
        {% endif %}
```

**Test**: Verify dashboard shows system status, handles error states, and event previews update correctly.

---

## Final Validation Checklist

### Privacy & Filtering
- [ ] Cam doesn't see Enhy calendar events
- [ ] Enhy doesn't see Cam calendar events  
- [ ] Both see shared calendar and info calendars
- [ ] Template calendars filter correctly with source tracking
- [ ] System health sensor validates all components

### Event Classification with Timezone Handling
- [ ] Timed events (< 23 hours) show time stamps with timezone awareness
- [ ] All-day events (23-47 hours) show no time
- [ ] Multi-day events (> 47 hours) show day indicators
- [ ] Duration calculations handle timezone changes
- [ ] Missing event data has sensible defaults

### Notification Delivery with Resilience
- [ ] Morning notifications sent to correct devices with retry logic
- [ ] Evening notifications sent to correct devices  
- [ ] 15-minute warnings fire for timed events only
- [ ] Notifications persist with proper tags and icons
- [ ] Notifications auto-clear when appropriate
- [ ] System gracefully handles service failures

### Edge Cases & Recovery
- [ ] System recovers after restart with health validation
- [ ] Catch-up notifications work at 18:30
- [ ] Real-time updates trigger on calendar changes
- [ ] Carryover events appear in next day's digest
- [ ] Preview window includes events until 04:00 next day
- [ ] Performance monitoring detects template calculation issues

### Testing & Monitoring
- [ ] Basic test script sends notifications to all devices
- [ ] Timezone boundary test validates duration calculations
- [ ] Clear test notifications works across all platforms
- [ ] Dashboard shows comprehensive system health
- [ ] Error states display missing components
- [ ] Performance metrics track template efficiency

### System Requirements & Validation
- [ ] All required calendar entities exist and are validated
- [ ] All notification services configured and tested
- [ ] Home Assistant version ≥ 2024.1 confirmed
- [ ] Timezone properly set and tested
- [ ] System health sensor shows green status

---

## Deployment Instructions

1. **Pre-Deployment Validation**:
   ```bash
   # Check HA version
   grep "version:" /config/.HA_VERSION
   
   # Verify calendar entities
   ha-cli states | grep calendar
   
   # Test notification services
   ha-cli service call notify.mobile_app_phone_c '{"message": "test"}'
   ```

2. **Copy to Package File**: Save all YAML to `/config/packages/calendar_notifications.yaml`

3. **Reload Components**:
   ```bash
   Developer Tools > YAML > Template Entities
   Developer Tools > YAML > Automations  
   Developer Tools > YAML > Scripts
   ```

4. **Validate Health**: Check `binary_sensor.calendar_system_health` shows `on`

5. **Test Phase by Phase**:
   - Phase 1: Verify helpers and health sensor
   - Phase 2: Check template calendars with source tracking
   - Phase 3: Test digest sensor attributes with timezone handling
   - Phase 4: Test notification scripts with retry logic
   - Phase 5: Test automations with temporary triggers
   - Phase 6: Verify system recovery and monitoring
   - Phase 7: Run comprehensive test suite

6. **Enable System**: Turn on `input_boolean.calendar_notifications`

7. **Monitor**: Watch dashboard for first 48 hours, verify all triggers fire correctly, notifications deliver reliably, and cleanup occurs properly

8. **Performance Monitoring**: Check template calculation times and adjust `scan_interval` if needed