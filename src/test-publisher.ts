import * as mqtt from 'mqtt';
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
  broker: yamlConfig.mqtt.broker,
  topic: yamlConfig.mqtt.topic,
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

const logger = winston.createLogger({
  level: yamlConfig.logging.level || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: logFilePath })
  ]
});

// Connect to the MQTT broker
const client = mqtt.connect(config.broker);

client.on('connect', () => {
  logger.info(`Connected to MQTT broker at ${config.broker}`);

  // Initial message
  const initialMessage = {
    temperature: 22.5,
    humidity: 45,
    status: "normal",
    device: {
      id: "sensor-01",
      battery: 98,
      location: "living-room"
    }
  };

  // Publish the initial message
  logger.info('Publishing initial message...');
  client.publish(config.topic, JSON.stringify(initialMessage));

  // Wait 2 seconds and publish a message with some changes
  setTimeout(() => {
    const updatedMessage = {
      temperature: 23.1, // Changed value
      humidity: 45,      // Same value
      status: "normal",  // Same value
      device: {
        id: "sensor-01",    // Same value
        battery: 97,        // Changed value
        location: "living-room" // Same value
      }
    };

    logger.info('Publishing updated message with changes...');
    client.publish(config.topic, JSON.stringify(updatedMessage));

    // Wait 2 more seconds and publish another message with different changes
    setTimeout(() => {
      const finalMessage = {
        temperature: 23.1,  // Same as previous
        humidity: 47,       // Changed value
        status: "warning",  // Changed value
        device: {
          id: "sensor-01",     // Same value
          battery: 97,         // Same as previous
          location: "living-room" // Same value
        }
      };

      logger.info('Publishing final message with different changes...');
      client.publish(config.topic, JSON.stringify(finalMessage));

      // Close the connection after a short delay
      setTimeout(() => {
        logger.info('Test completed. Disconnecting...');
        client.end();
      }, 1000);
    }, 2000);
  }, 2000);
});

client.on('error', (err) => {
  logger.error('MQTT client error:', err);
  client.end();
});
