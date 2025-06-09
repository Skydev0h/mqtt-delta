# MQTT Delta

A simple TypeScript Node.js application that connects to an MQTT server, subscribes to a specific topic, and prints out changes in received JSON objects.

## Features

- Connect to an MQTT broker with configurable credentials
- Subscribe to a specific topic
- Parse JSON messages
- Filter messages based on configurable conditions
- Detect and print only the changed properties between consecutive messages
- Support for nested objects with recursive change detection
- Ability to ignore specific keys when detecting changes
- Ability to ignore specific paths in the object hierarchy
- Logging to console and file
- Configuration via YAML file
- Graceful shutdown handling

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

## Configuration

The application is configured using the `config.yml` file in the root directory. Here's an example configuration:

```yaml
# MQTT Delta Configuration

# MQTT connection details
mqtt:
  broker: mqtt://localhost:1883
  username: ''
  password: ''
  clientId: mqtt-delta-client
  topic: test/topic
  tls: false

# Message filtering settings
messageFiltering:
  # Only process messages that match this condition
  condition:
    path: print.command
    value: push_status

# Change detection settings
changeDetection:
  # Keys to ignore anywhere in the object
  ignoredKeys:
    - timestamp
    - version
  # Specific paths to ignore (dot notation, e.g., "device.battery")
  ignoredPaths:
    - device.battery
    - sensors.temperature

# Logging configuration
logging:
  # Uncomment for specific log file name
  # file: logs/mqtt-delta.log
  level: info
```

### Configuration Options

#### MQTT Settings
- `mqtt.broker`: MQTT broker URL (default: mqtt://localhost:1883)
- `mqtt.username`: Username for authentication (default: empty)
- `mqtt.password`: Password for authentication (default: empty)
- `mqtt.clientId`: Client ID for MQTT connection (default: mqtt-delta-client)
- `mqtt.topic`: Topic to subscribe to (default: test/topic)
- `mqtt.tls`: Whether to use TLS (default: false)

#### Message Filtering Settings
- `messageFiltering.condition.path`: Path to the property to check for filtering (using dot notation)
- `messageFiltering.condition.value`: Value that the property must match for the message to be processed

#### Change Detection Settings
- `changeDetection.ignoredKeys`: Array of keys to ignore when detecting changes (default: empty array)
- `changeDetection.ignoredPaths`: Array of specific paths to ignore when detecting changes (default: empty array)

#### Logging Settings
- `logging.file`: Path to the log file. If not specified, a default filename with the format `mqtt-delta-YYYY-MM-DD-HH-mm-ss.log` will be used in the `logs` directory.
- `logging.level`: Log level (default: info)

## Usage

### Running the application

1. Edit the `config.yml` file to set your desired configuration
2. Run the application:

```bash
npm start
```

#### Configuration Examples

To connect to a different MQTT broker:
```yaml
mqtt:
  broker: mqtt://example.com:1883
  topic: home/sensors
```

To filter messages based on a specific condition:
```yaml
messageFiltering:
  condition:
    path: print.command
    value: push_status
```
This will only process messages where the `print.command` property equals `push_status`.

To ignore specific keys when detecting changes:
```yaml
changeDetection:
  ignoredKeys: 
    - timestamp
    - battery
```
This will ignore any property named `timestamp` or `battery` anywhere in the object.

To ignore specific paths when detecting changes:
```yaml
changeDetection:
  ignoredPaths:
    - device.battery
    - sensors.temperature
```
This will ignore changes to the `battery` property in the `device` object and the `temperature` property in the `sensors` object.

To change the log file location or log level:
```yaml
logging:
  file: /var/log/mqtt-delta.log
  level: debug
```

### Testing with the test publisher

The repository includes a test publisher script that publishes a series of test messages to demonstrate the change detection functionality. The test publisher uses the same `config.yml` file for its configuration.

```bash
# In one terminal, start the main application
npm start

# In another terminal, run the test publisher
npm run test-publish
```

The test publisher will send three messages with specific changes to the MQTT broker, and the main application will detect and display only the changed properties. Both the main application and test publisher will log to the configured log file.

### Logging

The application logs information to both the console and a file. The log file location and level can be configured in the `config.yml` file:

```yaml
logging:
  file: logs/mqtt-delta.log
  level: info
```

Available log levels (from most to least verbose):
- `debug`: Detailed debugging information
- `info`: General information messages (default)
- `warn`: Warning messages
- `error`: Error messages
- `silent`: No logging

The log file will be created automatically if it doesn't exist, and the directory structure will be created if needed.

If no log file path is specified in the configuration, the application will automatically generate a log file with the name `mqtt-delta-YYYY-MM-DD-HH-mm-ss.log` in the `logs` directory, where:
- `YYYY` is the four-digit year
- `MM` is the two-digit month (01-12)
- `DD` is the two-digit day (01-31)
- `HH` is the two-digit hour in 24-hour format (00-23)
- `mm` is the two-digit minute (00-59)
- `ss` is the two-digit second (00-59)

This ensures that each run of the application has a unique log file if none is explicitly configured.

### Building the application

```bash
npm run build
```

This will compile the TypeScript code to JavaScript in the `dist` directory.

## Examples

### Basic Change Detection

If the application receives these consecutive JSON messages on the subscribed topic:

Message 1:
```json
{
  "temperature": 22.5,
  "humidity": 45,
  "status": "normal"
}
```

Message 2:
```json
{
  "temperature": 23.1,
  "humidity": 45,
  "status": "normal"
}
```

The output will be:
```
[2023-04-15T12:34:56.789Z] {"temperature":23.1}
```

### Ignoring Specific Keys

If you configure the application with:
```yaml
changeDetection:
  ignoredKeys:
    - temperature
```

And it receives these messages:

Message 1:
```json
{
  "temperature": 22.5,
  "humidity": 45,
  "status": "normal"
}
```

Message 2:
```json
{
  "temperature": 23.1,
  "humidity": 47,
  "status": "normal"
}
```

The output will only show changes to humidity, ignoring the temperature change:
```
[2023-04-15T12:34:56.789Z] {"humidity":47}
```

### Path-Based Ignoring

Path-based ignoring allows you to ignore specific paths in the object hierarchy, rather than all occurrences of a key. For example, with this configuration:

```yaml
changeDetection:
  ignoredPaths:
    - device.battery
```

And these messages:

Message 1:
```json
{
  "temperature": 22.5,
  "device": {
    "id": "sensor-01",
    "battery": 98,
    "status": "online"
  },
  "backup": {
    "battery": 100
  }
}
```

Message 2:
```json
{
  "temperature": 23.1,
  "device": {
    "id": "sensor-01",
    "battery": 95,
    "status": "online"
  },
  "backup": {
    "battery": 90
  }
}
```

The output will show changes to temperature and backup.battery, but not to device.battery:
```
[2023-04-15T12:34:56.789Z] {"temperature":23.1,"backup":{"battery":90}}
```

### Message Filtering

You can configure the application to only process messages that match specific conditions:

```yaml
messageFiltering:
  condition:
    path: print.command
    value: push_status
```

With this configuration, only messages where the `print.command` property equals `push_status` will be processed. All other messages will be ignored.

## License

ISC
