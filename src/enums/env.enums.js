import "dotenv/config";

class EnvEnums {
  static firstTimeDepositCommissionToReferralUser = Number(
    process.env.FIRST_TIME_DEPOSIT_COMMISSION_TO_REFERRAL_USER
  );
}

module.exports = EnvEnums;
