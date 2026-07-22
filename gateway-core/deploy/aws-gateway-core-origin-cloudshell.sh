#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-1}"
NAME="${NAME:-matters-gateway-core-origin-dev}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3a.micro}"
REPO_URL="${REPO_URL:-https://github.com/thematters/matters-fediverse-gateway.git}"
REPO_REF="${REPO_REF:-main}"
VPC_ID="${VPC_ID:-}"
SUBNET_ID="${SUBNET_ID:-}"
PREFERRED_VPC_NAME="${PREFERRED_VPC_NAME:-dev-vpc}"
PREFERRED_PRIVATE_SUBNET_NAME="${PREFERRED_PRIVATE_SUBNET_NAME:-dev-private-sub-2}"

ROLE_NAME="${NAME}-ssm-role"
INSTANCE_PROFILE_NAME="${NAME}-profile"
SECURITY_GROUP_NAME="${NAME}-sg"

if ! aws sts get-caller-identity --region "$REGION" >/dev/null; then
  echo "AWS credentials are not available. Run this from AWS CloudShell or a configured AWS CLI session." >&2
  exit 1
fi

if [[ -z "$VPC_ID" ]]; then
  VPC_ID="$(
    aws ec2 describe-vpcs \
      --region "$REGION" \
      --filters "Name=tag:Name,Values=$PREFERRED_VPC_NAME" \
      --query 'Vpcs[0].VpcId' \
      --output text
  )"
fi

if [[ -z "$VPC_ID" || "$VPC_ID" == "None" ]]; then
  echo "No VPC named $PREFERRED_VPC_NAME found. Re-run with VPC_ID=vpc-... and SUBNET_ID=subnet-..." >&2
  exit 1
fi

if [[ -z "$SUBNET_ID" ]]; then
  SUBNET_ID="$(
    aws ec2 describe-subnets \
      --region "$REGION" \
      --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=$PREFERRED_PRIVATE_SUBNET_NAME" \
      --query 'Subnets[0].SubnetId' \
      --output text
  )"
fi

if [[ -z "$SUBNET_ID" || "$SUBNET_ID" == "None" ]]; then
  SUBNET_ID="$(
    aws ec2 describe-subnets \
      --region "$REGION" \
      --filters "Name=vpc-id,Values=$VPC_ID" Name=map-public-ip-on-launch,Values=false \
      --query 'Subnets | sort_by(@, &AvailableIpAddressCount)[-1].SubnetId' \
      --output text
  )"
fi

if [[ -z "$SUBNET_ID" || "$SUBNET_ID" == "None" ]]; then
  echo "No private subnet found. Re-run with SUBNET_ID=subnet-..." >&2
  exit 1
fi

if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  TRUST_POLICY="$(mktemp)"
  cat >"$TRUST_POLICY" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
JSON
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "file://$TRUST_POLICY" >/dev/null
  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore >/dev/null
fi

if ! aws iam get-instance-profile --instance-profile-name "$INSTANCE_PROFILE_NAME" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$INSTANCE_PROFILE_NAME" >/dev/null
  aws iam add-role-to-instance-profile \
    --instance-profile-name "$INSTANCE_PROFILE_NAME" \
    --role-name "$ROLE_NAME" >/dev/null
  echo "Waiting for instance profile propagation..."
  sleep 12
fi

SECURITY_GROUP_ID="$(
  aws ec2 describe-security-groups \
    --region "$REGION" \
    --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text
)"

if [[ -z "$SECURITY_GROUP_ID" || "$SECURITY_GROUP_ID" == "None" ]]; then
  SECURITY_GROUP_ID="$(
    aws ec2 create-security-group \
      --region "$REGION" \
      --vpc-id "$VPC_ID" \
      --group-name "$SECURITY_GROUP_NAME" \
      --description "Matters gateway-core origin, outbound tunnel only" \
      --query 'GroupId' \
      --output text
  )"
fi

AMI_ID="$(
  aws ssm get-parameter \
    --region "$REGION" \
    --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query 'Parameter.Value' \
    --output text
)"

USER_DATA="$(mktemp)"
cat >"$USER_DATA" <<EOF
#!/bin/bash
set -euxo pipefail

dnf update -y
dnf install -y git nodejs20 nodejs20-npm gcc-c++ make python3 sqlite openssl
alternatives --set node /usr/bin/node-20 || true
node --version
npm --version

id matters-gateway >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash matters-gateway
mkdir -p /opt/matters-gateway /etc/matters-gateway/secrets /var/lib/matters-gateway/runtime /var/lib/matters-gateway/runtime/backups /var/log/matters-gateway
chown -R matters-gateway:matters-gateway /opt/matters-gateway /var/lib/matters-gateway /var/log/matters-gateway
chmod 750 /etc/matters-gateway /etc/matters-gateway/secrets

if [[ ! -d /opt/matters-gateway/repo/.git ]]; then
  sudo -u matters-gateway git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" /opt/matters-gateway/repo
fi

cd /opt/matters-gateway/repo/gateway-core
sudo -u matters-gateway npm ci --omit=dev

cat >/etc/matters-gateway/matters-gateway-core.env <<'ENV'
WORKDIR=/opt/matters-gateway/repo/gateway-core
CONFIG_PATH=/etc/matters-gateway/staging.instance.json
HOST=127.0.0.1
PORT=8787
LOG_DIR=/var/log/matters-gateway
NODE_ENV=production
ENV

cat >/etc/matters-gateway/staging.instance.json <<'JSON'
{
  "instance": {
    "domain": "matters.town",
    "activityPathPrefix": "/ap",
    "title": "Matters Fediverse Gateway",
    "summary": "ActivityPub gateway for public Matters articles",
    "softwareName": "matters-gateway-core",
    "softwareVersion": "0.1.0",
    "openRegistrations": false
  },
  "actors": {
    "mashbeanmatters": {
      "displayName": "mashbean",
      "summary": "Canonical Matters Fediverse pilot actor",
      "autoAcceptFollows": true,
      "profileUrl": "https://matters.town/@mashbeanmatters",
      "aliases": ["https://matters.town/@mashbean"],
      "publicKeyPemFile": "./secrets/mashbeanmatters-public-key.pem",
      "privateKeyPemFile": "./secrets/mashbeanmatters-private-key.pem"
    }
  },
  "auth": {
    "edgeBearerTokenFile": "./secrets/edge-origin.token",
    "operatorBearerTokenFile": "./secrets/operator.token"
  },
  "dynamicActors": {
    "enabled": true,
    "profileHostAllowlist": ["matters.town"],
    "sharedSigningKey": {
      "publicKeyPemFile": "./secrets/mashbeanmatters-public-key.pem",
      "privateKeyPemFile": "./secrets/mashbeanmatters-private-key.pem"
    }
  },
  "remoteActors": {},
  "remoteDiscovery": {
    "cacheTtlMs": 3600000
  },
  "delivery": {
    "maxAttempts": 3,
    "userAgent": "MattersGatewayCore/0.1.0",
    "processingLeaseTimeoutMs": 900000
  },
  "inboundReconciliation": {
    "maxItemsPerRun": 20
  },
  "moderation": {
    "domainBlocks": [],
    "actorSuspensions": [],
    "remoteActorPolicies": [],
    "evidenceRetentionDays": 365,
    "rateLimits": {
      "instanceInbound": {
        "limit": 120,
        "windowMs": 60000
      },
      "actorInbound": {
        "limit": 60,
        "windowMs": 60000
      },
      "actorOutbound": {
        "limit": 30,
        "windowMs": 60000
      }
    }
  },
  "runtime": {
    "storeDriver": "sqlite",
    "sqliteFile": "/var/lib/matters-gateway/runtime/matters-gateway.sqlite",
    "alerting": {
      "backupMaxAgeHours": 24,
      "pendingQueueMaxAgeMinutes": 30,
      "openDeadLetterThreshold": 0,
      "openAbuseCaseThreshold": 0,
      "pendingQueueThreshold": 25,
      "dispatch": {
        "enabled": false
      }
    },
    "metrics": {
      "dispatch": {
        "enabled": false
      }
    },
    "logs": {
      "dispatch": {
        "enabled": false
      }
    }
  }
}
JSON

cat >/etc/systemd/system/matters-gateway-core.service <<'UNIT'
[Unit]
Description=Matters Gateway Core
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/matters-gateway/matters-gateway-core.env
WorkingDirectory=/opt/matters-gateway/repo/gateway-core
ExecStart=/usr/bin/env node src/server.mjs --config /etc/matters-gateway/staging.instance.json --host 127.0.0.1 --port 8787
Restart=always
RestartSec=5
StandardOutput=append:/var/log/matters-gateway/gateway-core.out.log
StandardError=append:/var/log/matters-gateway/gateway-core.err.log

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl disable matters-gateway-core.service

cat >/etc/matters-gateway/README-next-steps.txt <<'TXT'
Next steps before starting matters-gateway-core:
1. Provision /etc/matters-gateway/secrets/mashbeanmatters-public-key.pem.
2. Provision /etc/matters-gateway/secrets/mashbeanmatters-private-key.pem.
3. Provision independent random values in /etc/matters-gateway/secrets/edge-origin.token and operator.token.
4. chown root:matters-gateway /etc/matters-gateway/secrets/*
5. chmod 640 /etc/matters-gateway/secrets/*
6. Store edge-origin.token as the Cloudflare Worker GATEWAY_ORIGIN_BEARER_TOKEN secret.
7. Store operator.token in the Lambda and matters-server production secret stores.
8. systemctl enable --now matters-gateway-core.service
9. curl -s http://127.0.0.1:8787/healthz
TXT
EOF

INSTANCE_ID="$(
  aws ec2 run-instances \
    --region "$REGION" \
    --image-id "$AMI_ID" \
    --instance-type "$INSTANCE_TYPE" \
    --network-interfaces "DeviceIndex=0,SubnetId=$SUBNET_ID,Groups=[$SECURITY_GROUP_ID],AssociatePublicIpAddress=false" \
    --iam-instance-profile "Name=$INSTANCE_PROFILE_NAME" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME},{Key=Project,Value=matters-fediverse-gateway},{Key=Role,Value=gateway-core-origin},{Key=Environment,Value=dev}]" \
    --metadata-options "HttpTokens=required,HttpEndpoint=enabled" \
    --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":20,"VolumeType":"gp3","Encrypted":true,"DeleteOnTermination":false}}]' \
    --user-data "file://$USER_DATA" \
    --query 'Instances[0].InstanceId' \
    --output text
)"

echo "Created $INSTANCE_ID in $REGION"
echo "Name: $NAME"
echo "VPC: $VPC_ID"
echo "Subnet: $SUBNET_ID"
echo "Security group: $SECURITY_GROUP_ID"
echo "Public IPv4: disabled"
echo "Next: wait for status checks, then use SSM Session Manager to provision actor key files and start the service."
