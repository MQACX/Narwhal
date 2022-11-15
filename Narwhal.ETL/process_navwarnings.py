import os
import re
import paho.mqtt.publish as publish
import time

from datetime import datetime, date
from pymongo import MongoClient

coordinatesRegex = r"(?P<LatitudeDegrees>[0-9]+)\s*[\-°ºd]\s*(?P<LatitudeMinutes>[0-9]+[.,]?[0-9]*)\s*['\-m]?\s*(?P<LatitudeSeconds>[0-9]+)?\s*[""\-s]*\s*(?P<LatitudeDirection>[NS][^\s0-9<>]*)\s*(?P<LongitudeDegrees>[0-9]+)\s*[\-°ºd]\s*(?P<LongitudeMinutes>[0-9]+[.,]?[0-9]*)\s*['\-m]?\s*(?P<LongitudeSeconds>[0-9]+)?\s*[""\-s]*\s*(?P<LongitudeDirection>[EWO][^\s0-9<>]*)"


def main():

    # Get storage directory from the environment
    storageDirectory = os.environ.get("STORAGE_DIRECTORY")
    if not storageDirectory:
        storageDirectory = os.path.dirname(os.path.realpath(__file__)) + r"\..\Playground\Storage"

    # Create the file name
    now = date.today()
    now = datetime(now.year, now.month, now.day)
    fileName = now.strftime("%Y-%m-%d") + ".txt"
    filePath = os.path.join(storageDirectory, fileName)

    print("Reading data file from " + filePath)

    # Exit if no file is present
    if not os.path.exists(filePath):
        print("File could not be found")
        return

    # Read the file
    with open(filePath, "r") as f:
        fileContent = f.read()

    # Extract coordinates
    navwarnings = []

    for coordinateMatch in re.finditer(coordinatesRegex, fileContent):

        latitudeDegrees = float(coordinateMatch.group("LatitudeDegrees") or 0)
        latitudeMinutes = float(coordinateMatch.group("LatitudeMinutes") or 0)
        latitudeSeconds = float(coordinateMatch.group("LatitudeSeconds") or 0)
        latitudeDirection = coordinateMatch.group("LatitudeDirection")[0:1]

        longitudeDegrees = float(coordinateMatch.group("LongitudeDegrees") or 0)
        longitudeMinutes = float(coordinateMatch.group("LongitudeMinutes") or 0)
        longitudeSeconds = float(coordinateMatch.group("LongitudeSeconds") or 0)
        longitudeDirection = coordinateMatch.group("LongitudeDirection")[0:1]

        latitude = (latitudeDegrees + latitudeMinutes / 60 + latitudeSeconds / 3600) * (1 if latitudeDirection == 'N' else -1)
        longitude = (longitudeDegrees + longitudeMinutes / 60 + longitudeSeconds / 3600) * (1 if longitudeDirection == 'E' else -1)

        if (latitude < -90 or latitude > 90):
            continue
        if (longitude < -180 or longitude > 180):
            continue

        navwarnings.append({
            "Source": "SHOM",
            "Date": now,
            "Data": {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [ longitude, latitude ]
                }
            }
        })

    print("Extracted {0} coordinates".format(len(navwarnings)))

    # Write extracted coordinates
    databaseHost = os.environ.get("DATABASE_HOST") or "127.0.0.1"
    databasePort = int(os.environ.get("DATABASE_PORT") or "27017")

    print("Inserting to MongoDB at {0}:{1}".format(databaseHost, databasePort))

    client = MongoClient(databaseHost, databasePort, serverSelectionTimeoutMS = 2500)
    database = client.narwhal
    navwarningCollection = database.navwarnings

    # I'm unsure why, but the function .remove({}) didn't exist in the Collection type.
    # Full error: TypeError: 'Collection' object is not callable. If you meant to call the 'remove' method on a 'Collection' object it is failing because no such method exists.
    navwarningCollection.delete_many({})
    for navwarning in navwarnings:
        navwarningCollection.insert_one(navwarning)

    # Send an event to the message queue
    messageQueueHost = os.environ.get("MESSAGEQUEUE_HOST") or "127.0.0.1"
    messageQueuePort = int(os.environ.get("MESSAGEQUEUE_PORT") or "1883")

    print("Sending an event to MQTT at {0}:{1}".format(messageQueueHost, messageQueuePort))

    publish.single("narwhal/navwarnings/update", int(time.time()), hostname = messageQueueHost, port = messageQueuePort)

    print("All good :)")


if __name__ == "__main__":
    main()