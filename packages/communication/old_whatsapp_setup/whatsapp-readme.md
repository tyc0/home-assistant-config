# Home Assistant WhatsApp Integration System

## Overview
This system provides a comprehensive WhatsApp integration for Home Assistant, enabling message management, translations, and chat functionality for multiple users. The system is split into four main configuration files, each handling specific aspects of the WhatsApp functionality.

## File Structure
```
/config/packages/communication/
├── whatsapp_sensors.yaml     # Core sensors and base entities
├── whatsapp_manager.yaml     # Contact management
├── whatsapp_translator.yaml  # Translation features
└── whatsapp_chat.yaml       # Chat interface
```

## Component Details

### 1. whatsapp_sensors.yaml
Core configuration file containing base sensors and entities.

**Key Components:**
- Template sensors for monitoring WhatsApp notifications
- Base message input entities
- Inbound/outbound message handlers
- Single/group chat entities

**Main Entities:**
- `sensor.whatsapp_messages_phone_c`
- `sensor.whatsapp_messages_phone_e`
- Various `input_text` entities for message handling

### 2. whatsapp_manager.yaml
Handles contact management and core message processing.

**Key Features:**
- Recent contacts management
- Message queuing system
- Debug functionality
- Unread message tracking

**Main Components:**
- Recent contact storage
- Message processing automation
- Contact update system
- Debug notifications

### 3. whatsapp_translator.yaml
Manages message translation and enhancement features.

**Key Features:**
- Message translation
- AI-powered message polishing
- Auto-reply functionality
- Language selection

**Main Components:**
- Translation toggles
- Language selection inputs
- Translation scripts
- AI integration

### 4. whatsapp_chat.yaml
Manages the chat interface and message history.

**Key Features:**
- Active chat management
- Chat history tracking
- Message sending interface
- Real-time updates

**Main Components:**
- Chat history storage
- Message sending automation
- Active chat tracking
- UI interaction handlers

## Usage

### Setting Up A New User
1. Add required entities in whatsapp_sensors.yaml
2. Configure contact management in whatsapp_manager.yaml
3. Add translation settings if needed
4. Set up chat interface entities

### Sending Messages
Messages can be sent through:
1. Direct entity updates
2. Chat interface
3. Automations

Example automation:
```yaml
automation:
  - alias: "Send WhatsApp Alert"
    trigger:
      - platform: state
        entity_id: binary_sensor.door_sensor
        to: "on"
    action:
      - service: script.whatsapp_send_message
        data:
          user_id: "c"
          chat_number: "447123456789"
          message: "Door opened!"
```

### Translation Features
To enable translation:
1. Set `input_boolean.translator_[user]_enabled` to on
2. Set target language in `input_text.translator_[user]_output_language`
3. Enter message in `input_text.translator_[user]_en_msg`

### Chat History
Chat history is maintained for the three most recent contacts per user. History updates automatically for:
- Incoming messages
- Outgoing messages
- Contact changes

## System Features

### Core Features
- Multi-user support (C and E users)
- Real-time message processing
- Contact management
- Chat history tracking

### Enhanced Features
- Message translation
- AI message polishing
- Auto-replies
- Debug monitoring

### UI Integration
- Active chat selection
- Message history display
- Contact management
- Translation interface

## Troubleshooting

### Common Issues
1. **Messages Not Sending**
   - Check WhatsApp connection
   - Verify phone number format
   - Check debug notifications

2. **Translation Not Working**
   - Verify translation toggle is enabled
   - Check target language setting
   - Verify AI service connection

3. **Chat History Not Updating**
   - Check message processing automation
   - Verify entity states
   - Check for template errors

### Debug Mode
Enable debug notifications by:
1. Using the "WhatsApp - Debug Events" automation
2. Monitoring persistent notifications
3. Checking Home Assistant logs

## Contributing
To add new features:
1. Create in appropriate yaml file
2. Follow existing naming conventions
3. Use templates where possible
4. Add documentation

## Notes
- Maximum message length: 255 characters
- Supported languages depend on AI service
- Keep debug mode disabled in production
- Regular backups recommended

## Dependencies
- Home Assistant WhatsApp integration
- Text-to-speech (for notifications)
- AI integration (for translation)
- Mobile app integration