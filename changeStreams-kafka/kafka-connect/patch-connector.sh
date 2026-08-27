#!/usr/bin/env bash
set -euo pipefail

CONNECTOR_VERSION="${CONNECTOR_VERSION:-3.0.1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEMO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KAFKA_DIR="$DEMO_DIR/kafka_2.13-4.3.1"
PLUGIN_DIR="$SCRIPT_DIR/plugins"
WORK_DIR="${TMPDIR:-/tmp}/mongo-kafka-connect-patch-${CONNECTOR_VERSION}"

CONNECTOR_JAR="mongo-kafka-connect-${CONNECTOR_VERSION}-all.jar"
SOURCES_JAR="mongo-kafka-connect-${CONNECTOR_VERSION}-sources.jar"
MAVEN_BASE="https://repo1.maven.org/maven2/org/mongodb/kafka/mongo-kafka-connect/${CONNECTOR_VERSION}"

if [[ ! -d "$KAFKA_DIR/libs" ]]; then
  echo "Kafka libs directory was not found:"
  echo "  $KAFKA_DIR/libs"
  echo "Download and unpack Kafka under:"
  echo "  $DEMO_DIR/kafka_2.13-4.3.1"
  exit 1
fi

mkdir -p "$PLUGIN_DIR" "$WORK_DIR/classes"
rm -rf "$WORK_DIR/com"

echo "Downloading MongoDB Kafka Connector ${CONNECTOR_VERSION}..."
curl -fL -o "$PLUGIN_DIR/$CONNECTOR_JAR" "$MAVEN_BASE/$CONNECTOR_JAR"
curl -fL -o "$WORK_DIR/$SOURCES_JAR" "$MAVEN_BASE/$SOURCES_JAR"

cp "$PLUGIN_DIR/$CONNECTOR_JAR" "$PLUGIN_DIR/$CONNECTOR_JAR.orig"

cd "$WORK_DIR"
jar xf "$SOURCES_JAR" \
  com/mongodb/kafka/connect/MongoSourceConnector.java \
  com/mongodb/kafka/connect/util/ResumeTokenUtils.java

python3 - <<'PY'
from pathlib import Path

source = Path("com/mongodb/kafka/connect/MongoSourceConnector.java")
text = source.read_text()
text = text.replace("import static com.mongodb.kafka.connect.util.ConnectionValidator.validateUserHasActions;\n", "")
text = text.replace("import static java.util.Arrays.asList;\n", "")
text = text.replace('  private static final List<String> REQUIRED_SOURCE_ACTIONS = asList("changeStream", "find");\n', "")
text = text.replace(
"""                validateUserHasActions(
                    client,
                    sourceConfig.getConnectionString().getCredential(),
                    REQUIRED_SOURCE_ACTIONS,
                    sourceConfig.getString(MongoSourceConfig.DATABASE_CONFIG),
                    sourceConfig.getString(MongoSourceConfig.COLLECTION_CONFIG),
                    MongoSourceConfig.CONNECTION_URI_CONFIG,
                    config);
""",
"",
)
source.write_text(text)

resume = Path("com/mongodb/kafka/connect/util/ResumeTokenUtils.java")
text = resume.read_text()
old = """  public static OptionalLong getResponseOffsetSecs(final BsonDocument response) {
    return Optional.of(response)
        .map(v -> v.get("cursor"))
        .map(BsonValue::asDocument)
        .map(v -> v.get("postBatchResumeToken"))
        .map(BsonValue::asDocument)
        .map(
            token ->
                response.get("operationTime").asTimestamp().getTime()
                    - getTimestampFromResumeToken(token).asTimestamp().getTime())
        .map(OptionalLong::of)
        .orElse(OptionalLong.empty());
  }
"""
new = """  public static OptionalLong getResponseOffsetSecs(final BsonDocument response) {
    BsonValue operationTime = response.get("operationTime");
    if (operationTime == null || !operationTime.isTimestamp()) {
      return OptionalLong.empty();
    }

    return Optional.of(response)
        .map(v -> v.get("cursor"))
        .map(BsonValue::asDocument)
        .map(v -> v.get("postBatchResumeToken"))
        .map(BsonValue::asDocument)
        .map(
            token ->
                operationTime.asTimestamp().getTime()
                    - getTimestampFromResumeToken(token).asTimestamp().getTime())
        .map(OptionalLong::of)
        .orElse(OptionalLong.empty());
  }
"""
if old not in text:
    raise SystemExit("Could not find expected ResumeTokenUtils method body to patch")
resume.write_text(text.replace(old, new))
PY

echo "Compiling patched classes..."
javac -cp "$PLUGIN_DIR/$CONNECTOR_JAR:$KAFKA_DIR/libs/*" \
  -d "$WORK_DIR/classes" \
  "$WORK_DIR/com/mongodb/kafka/connect/MongoSourceConnector.java" \
  "$WORK_DIR/com/mongodb/kafka/connect/util/ResumeTokenUtils.java"

echo "Updating connector JAR..."
cd "$WORK_DIR/classes"
zip -q -u -D "$PLUGIN_DIR/$CONNECTOR_JAR" \
  com/mongodb/kafka/connect/MongoSourceConnector.class \
  com/mongodb/kafka/connect/util/ResumeTokenUtils.class

echo "Verifying patch..."
if javap -classpath "$PLUGIN_DIR/$CONNECTOR_JAR" -c -p com.mongodb.kafka.connect.MongoSourceConnector | grep -q validateUserHasActions; then
  echo "Patch verification failed: validateUserHasActions is still present"
  exit 1
fi

javap -classpath "$PLUGIN_DIR/$CONNECTOR_JAR" -c -p com.mongodb.kafka.connect.util.ResumeTokenUtils | grep -q "OptionalLong.empty"

echo "Patched connector created:"
echo "  $PLUGIN_DIR/$CONNECTOR_JAR"
echo "Original backup:"
echo "  $PLUGIN_DIR/$CONNECTOR_JAR.orig"
