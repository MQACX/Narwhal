import os
import glob
import re
import struct
import json
import paho.mqtt.publish as publish
import time
from collections import namedtuple

from datetime import datetime, date
from pymongo import MongoClient


trackingFileRegex = r"tracking_(?P<VesselId>[0-9]+)_(?P<Year>[0-9]+).vectortile$"


# From https://stackoverflow.com/a/15882054
def _json_object_hook(d): return namedtuple('X', d.keys())(*d.values())
def json2obj(data): return json.loads(data, object_hook=_json_object_hook)


def getDataSize(type):
    if type == 'Float32':
        return 4
    print("Given type is not supported")
    raise Exception()

def parseData(data, type):
    if type == 'Float32':
        return struct.unpack('<f', data)[0]
    print("Given type is not supported")
    raise Exception()

def main():

    trackingPoints = []

    # Get storage directory from the environment
    storageDirectory = os.environ.get("STORAGE_DIRECTORY")
    if not storageDirectory:
        storageDirectory = os.path.dirname(os.path.realpath(__file__)) + r"\..\Playground\Storage"

    # Listing files to import
    files = os.listdir(storageDirectory)

    for file in files:

        # Filter out non tracking files
        match = re.match(trackingFileRegex, file)
        if not match:
            continue

        # Those vectortile files are TypedMatrix files, as described here: https://github.com/GlobalFishingWatch/pelagos-client/blob/883115cba9d68957d78b0e8d1b2314f923073798/js/app/Data/TypedMatrixParser.js
        #   ['tmtx' magic cookie]
        #   [4 byte header length in bytes]
        #   [header data]
        #   [padding]
        #   [content data]

        filePath = os.path.join(storageDirectory, file)
        file = open(filePath, "rb")

        # Validate magic cookie
        magicCookie = file.read(4).decode("utf-8")
        if magicCookie != 'tmtx':
            continue

        print("Reading data file from " + filePath)

        # Decode header
        headerLength = struct.unpack('<i', file.read(4))[0]
        header = file.read(headerLength).decode("utf-8")
        header = json2obj(header)

        orientation = header.orientation
        columns = header.cols
        length = header.length

        print("Reading " + str(length) + " positions")

        # Read data
        if orientation == 'columnwise':
            columnBytes = [ file.read(getDataSize(column.type) * length) for column in columns ]
            columnData = [ [ column[(i * 4):(i * 4 + int(len(column) / length))] for i in range(length) ] for column in columnBytes ]
            columnValues = [ [ parseData(bytes, columns[i].type) for bytes in column ] for i, column in enumerate(columnData) ]

            data = [ [ columnValues[j][i] for j in range(len(columns)) ] for i in range(length) ]

        else:
            raise Exception()

        # Prepare data
        for row in data:

            vesselId = int(match['VesselId'])
            date = datetime.fromtimestamp(row[0] / 1000)
            latitude = row[1]
            longitude = row[2]

            trackingPoints.append({
                "Vessel": vesselId,
                "Date": date,
                "Position": [ longitude, latitude ]
            })
    
    # Write extracted coordinates
    databaseHost = os.environ.get("DATABASE_HOST") or "127.0.0.1"
    databasePort = int(os.environ.get("DATABASE_PORT") or "27017")

    print("Inserting to MongoDB at {0}:{1}".format(databaseHost, databasePort))

    client = MongoClient(databaseHost, databasePort, serverSelectionTimeoutMS = 2500)
    database = client.narwhal
    trackingCollection = database.tracking

    # I'm unsure why, but the function .remove({}) didn't exist in the Collection type.
    # Full error: TypeError: 'Collection' object is not callable. If you meant to call the 'remove' method on a 'Collection' object it is failing because no such method exists.
    trackingCollection.delete_many({})
    for trackingPoint in trackingPoints:
        trackingCollection.insert_one(trackingPoint)

    # Send an event to the message queue
    messageQueueHost = os.environ.get("MESSAGEQUEUE_HOST") or "127.0.0.1"
    messageQueuePort = int(os.environ.get("MESSAGEQUEUE_PORT") or "1883")

    print("Sending an event to MQTT at {0}:{1}".format(messageQueueHost, messageQueuePort))

    publish.single("narwhal/tracking/update", int(time.time()), hostname = messageQueueHost, port = messageQueuePort)

    print("All good :)")


if __name__ == "__main__":
    main()