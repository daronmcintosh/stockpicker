#!/usr/bin/env python3
import re

# Read file
with open('/Users/daronmcintosh/repos/stockpicker/apiserver/src/services/strategyService.ts', 'r') as f:
    content = f.read()

# Fix patterns - more specific replacements
fixes = [
    # UpdateStrategyPrivacy
    (r'(\s+)(return \{ strategy \};)(\s+\}[\s,]+async updateStrategyPrivacy)', r'\1return create(UpdateStrategyPrivacyResponseSchema, { strategy });\3'),

    # SendOTP responses
    (r'(async sendOTP[\s\S]*?)(return \{[\s\n]+success: (true|false),[\s\n]+message: ([^}]+)\};)',
     lambda m: m.group(1) + f'return create(SendOTPResponseSchema, {{ success: {m.group(3)}, message: {m.group(4)}}});'),

    # GetCurrentUser responses
    (r'return \{ user: (protoUser|undefined) \};(?=[\s\S]*?async updateUser)',
     r'return create(GetCurrentUserResponseSchema, { user: \1 });'),

    # UpdateUser responses
    (r'return \{ user: protoUser \};(?=[\s\S]*?async followUser)',
     r'return create(UpdateUserResponseSchema, { user: protoUser });'),

    # FollowUser response
    (r'return \{ success: true \};(?=[\s\S]*?async unfollowUser)',
     r'return create(FollowUserResponseSchema, { success: true });'),

    # UnfollowUser response
    (r'return \{ success: true \};(?=[\s\S]*?async listFollowing)',
     r'return create(UnfollowUserResponseSchema, { success: true });'),

    # ListFollowing
    (r'return \{ users \};(?=[\s\S]*?async listFollowers)',
     r'return create(ListFollowingResponseSchema, { users });'),

    # ListFollowers
    (r'return \{ users \};(?=[\s\S]*?async listCloseFriends)',
     r'return create(ListFollowersResponseSchema, { users });'),

    # ListCloseFriends
    (r'return \{ users \};(?=[\s\S]*?async getUserProfile)',
     r'return create(ListCloseFriendsResponseSchema, { users });'),

    # CopyStrategy
    (r'return \{ strategy \};(?=[\s\S]*?^\};$)',
     r'return create(CopyStrategyResponseSchema, { strategy });'),
]

# Apply simple string replacements first
content = content.replace(
    'return { strategy };\n  },\n\n  async updateStrategyPrivacy(',
    'return create(UpdateStrategyPrivacyResponseSchema, { strategy });\n  },\n\n  async updateStrategyPrivacy('
)

# Write file
with open('/Users/daronmcintosh/repos/stockpicker/apiserver/src/services/strategyService.ts', 'w') as f:
    f.write(content)

print("Fixed strategyService.ts")
