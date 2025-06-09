import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as winston from 'winston';

// Load configuration from config.yml
const configPath = path.resolve(__dirname, '../config.yml');
const configFile = fs.readFileSync(configPath, 'utf8');
const yamlConfig = yaml.load(configFile) as any;

// Configuration
const config = {
  // MQTT connection details
  broker: yamlConfig.mqtt.broker,
  username: yamlConfig.mqtt.username,
  password: yamlConfig.mqtt.password,
  clientId: yamlConfig.mqtt.clientId || `mqtt-delta-client-${Math.random().toString(16).substring(2, 8)}`,

  // Topic to subscribe to
  topic: yamlConfig.mqtt.topic,

  // TLS configuration
  tls: yamlConfig.mqtt.tls,

  // Message filtering
  messageFiltering: yamlConfig.messageFiltering || { condition: { path: '', value: '' } },

  // Change detection settings
  ignoredKeys: yamlConfig.changeDetection.ignoredKeys || [],
  ignoredPaths: yamlConfig.changeDetection.ignoredPaths || []
};

/**
 * Generates a default log filename with the format mqtt-delta-YYYY-MM-DD-HH-mm-ss.log
 * @returns The default log filename
 */
function generateDefaultLogFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `mqtt-delta-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.log`;
}

// Set up logging
const logFilePath = yamlConfig.logging.file || path.join('logs', generateDefaultLogFilename());
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for console output - simple format with timestamp
const shortFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `[${timestamp}] ${message}`;
});

const logger = winston.createLogger({
  level: yamlConfig.logging.level || 'info',
  transports: [
    // Console transport with simple format
    new winston.transports.Console({
      format: winston.format.combine(
          winston.format.timestamp({
            format: () => new Date().toLocaleString()
          }),
          shortFormat
      )
    }),
    // File transport with JSON format for better machine readability
    new winston.transports.File({
      filename: logFilePath,
      format: winston.format.combine(
          winston.format.timestamp({
            format: () => new Date().toLocaleString()
          }),
          shortFormat
      )
    })
  ]
});

// Store the previous message for comparison
let previousMessage: Record<string, any> | null = null;

/**
 * Gets a value from an object by path using dot notation
 * Example: getValueByPath(obj, "user.address.city")
 */
function getValueByPath(obj: Record<string, any>, path: string): any {
  if (!path) return undefined;

  const keys = path.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Checks if a path should be ignored based on the ignoredPaths configuration
 * @param path The current path in dot notation
 * @returns True if the path should be ignored, false otherwise
 */
function shouldIgnorePath(path: string): boolean {
  return config.ignoredPaths.some((ignoredPath: string) => {
    // Exact match
    if (ignoredPath === path) {
      return true;
    }

    // Check if the path starts with the ignored path followed by a dot
    // This handles nested paths (e.g., "device.battery" should match "device.battery.level")
    if (path.startsWith(ignoredPath + '.')) {
      return true;
    }

    return false;
  });
}

/**
 * Detects changes between two objects and returns an object containing only the changed properties
 * @param previous The previous object to compare against
 * @param current The current object to check for changes
 * @param currentPath The current path in dot notation (used for path-based ignoring)
 * @returns An object containing only the changed properties
 */
function detectChanges(
  previous: Record<string, any> | null, 
  current: Record<string, any>,
  currentPath: string = ''
): Record<string, any> {
  if (!previous) return current; // If no previous message, return the entire current message

  const changes: Record<string, any> = {};

  // Check for changed or new properties
  for (const key in current) {
    // Skip keys that are in the ignored list
    if (config.ignoredKeys.includes(key)) {
      continue;
    }

    // Calculate the path for this property
    const propertyPath = currentPath ? `${currentPath}.${key}` : key;

    // Skip paths that should be ignored
    if (shouldIgnorePath(propertyPath)) {
      continue;
    }

    // If the property is an object, recursively check for changes
    if (typeof current[key] === 'object' && current[key] !== null && 
        typeof previous[key] === 'object' && previous[key] !== null) {
      const nestedChanges = detectChanges(previous[key], current[key], propertyPath);
      if (Object.keys(nestedChanges).length > 0) {
        changes[key] = nestedChanges;
      }
    } 
    // For non-object properties or if the previous value wasn't an object, check for direct changes
    else if (JSON.stringify(current[key]) !== JSON.stringify(previous[key])) {
      changes[key] = current[key];
    }
  }

  return changes;
}

/**
 * Connects to the MQTT broker and subscribes to the configured topic
 */
function connectAndSubscribe(): MqttClient {
  logger.info(`Connecting to MQTT broker at ${config.broker}`);

  // Connect to the MQTT broker
  const client = mqtt.connect(config.broker, {
    username: config.username,
    password: config.password,
    clientId: config.clientId,
    rejectUnauthorized: false,
    protocol: config.tls ? 'mqtts' : 'mqtt'
  });

  // Handle connection events
  client.on('connect', () => {
    logger.info('Connected to MQTT broker');

    // Subscribe to the configured topic
    client.subscribe(config.topic, (err) => {
      if (err) {
        logger.error(`Error subscribing to topic ${config.topic}:`, err);
      } else {
        logger.info(`Subscribed to topic successfully`);
      }
    });
  });

  // Handle message events
  client.on('message', (topic, message) => {
    try {
      // Parse the message as JSON
      const jsonMessage = JSON.parse(message.toString());

      // Apply message filtering if configured
      if (config.messageFiltering && config.messageFiltering.condition) {
        const { path, value } = config.messageFiltering.condition;
        if (path && getValueByPath(jsonMessage, path) !== value) {
          return;
        }
      }

      // Detect changes from the previous message
      const changes = detectChanges(previousMessage, jsonMessage);

      // If there are changes, print them
      if (previousMessage != null && Object.keys(changes).length > 0) {
        logger.info(JSON.stringify(changes));
      }

      // Update the previous message
      previousMessage = jsonMessage;
    } catch (error) {
      logger.error('Error processing message:', error);
      logger.info('Raw message:', message.toString());
    }
  });

  // Handle error events
  client.on('error', (err) => {
    logger.error('MQTT client error:', err);
  });

  // Handle close events
  client.on('close', () => {
    logger.info('Connection to MQTT broker closed');
  });

  return client;
}

// Start the application
const client = connectAndSubscribe();

// Handle application termination
process.on('SIGINT', () => {
  logger.info('Disconnecting from MQTT broker...');
  client.end(true, () => {
    logger.info('Disconnected from MQTT broker');
    process.exit(0);
  });
});
