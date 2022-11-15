using System;
using System.Collections.Generic;
using System.Linq;

using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

using MongoDB.Bson;
using MongoDB.Driver;

using Narwhal.Service.Models;
using Narwhal.Service.Services;

namespace Narwhal.Service.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TrackingController : ControllerBase
    {
        private readonly ILogger<TrackingController> _logger;
        private readonly DatabaseService _databaseService;
        private readonly MessagingService _messagingService;

        public TrackingController(
            ILogger<TrackingController> logger,
            DatabaseService databaseService,
            MessagingService messagingService)
        {
            _logger = logger;
            _databaseService = databaseService;
            _messagingService = messagingService;
        }

        [HttpGet("Get")]
        public IEnumerable<TrackingPoint> Get(DateTime? from = null, DateTime? to = null, int limit = 10000)
        {
            from ??= DateTime.MinValue;
            to ??= DateTime.MaxValue;

            var trackingCollection = _databaseService.GetTrackingCollection();
            var eventsCollection = _databaseService.GetEventsCollection();

            eventsCollection.InsertOne(new BsonDocument()
            {
                { "Timestamp", DateTime.UtcNow },
                { "Source", HttpContext.Features.Get<IHttpConnectionFeature>()?.RemoteIpAddress?.ToString() },
                { "Browser", Request.Headers["User-Agent"].FirstOrDefault() ?? null },
                { "Action", $"{nameof(TrackingController)}.{nameof(Get)}" }
            });

            return trackingCollection
                .Find(Builders<BsonDocument>.Filter.Gte("Date", from) & Builders<BsonDocument>.Filter.Lt("Date", to))
                .ToEnumerable()
                .ToArray()
                .Select(b => new TrackingPoint()
                {
                    Vessel = b["Vessel"].AsInt32,
                    Date = b["Date"].AsDateTime,
                    Latitude = b["Position"][1].AsDouble,
                    Longitude = b["Position"][0].AsDouble
                })
                .Take(limit);
        }
    }
}
