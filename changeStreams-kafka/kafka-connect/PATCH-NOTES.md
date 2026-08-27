# MongoDB Kafka Connector Patch Notes

This demo uses a patched copy of `mongo-kafka-connect-3.0.1-all.jar` for Oracle Database API for MongoDB compatibility.

Create the patched JAR locally with:

```bash
kafka-connect/patch-connector.sh
```

Original backup:

```text
kafka-connect/plugins/mongo-kafka-connect-3.0.1-all.jar.orig
```

Patched classes:

- `com.mongodb.kafka.connect.MongoSourceConnector`
- `com.mongodb.kafka.connect.util.ResumeTokenUtils`

## Changes

### Skip `rolesInfo` Startup Validation

`MongoSourceConnector.validate(...)` no longer calls `ConnectionValidator.validateUserHasActions(...)`.

The original connector uses that validation to inspect MongoDB user privileges and roles. That path calls the MongoDB `rolesInfo` command, which is not supported by Oracle Database API for MongoDB.

The patched connector still performs the connection and Server API validation.

### Ignore Missing `operationTime`

`ResumeTokenUtils.getResponseOffsetSecs(...)` now returns `OptionalLong.empty()` when the command response does not include an `operationTime` timestamp.

Oracle Database API for MongoDB change stream responses may omit `operationTime`. The original connector assumed that field was always present and logged repeated `NullPointerException` warnings from the command listener.
