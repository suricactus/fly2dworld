#!/bin/bash

ORIGINS=(SOF OTP);
DEPARTURES=(07 30);
STAY_DURATIONS=(00 07);
ORDERS=(quality price duration)
DATE=`date --iso`

cd /home/suricactus/work/geo/fly2dworld;
mkdir -p "./result/$DATE"

for origin in "${ORIGINS[@]}"
do
  for order in "${ORDERS[@]}"
  do
    for departure in "${DEPARTURES[@]}"
    do
      for stay in "${STAY_DURATIONS[@]}"
      do

        CMD="/home/suricactus/.nvm/versions/node/v8.9.4/bin/node --trace-warnings --experimental-modules script.mjs \
          --from $origin \
          --order $order \
          --departure $departure"

        if [ $stay != "00" ]
        then
          CMD="$CMD --stay-duration $stay"
        fi

        RETRY=0

        CMD="$CMD < ./setup/airports_final.csv 2>/dev/stdout"
        RESULT_FILE="./result/$DATE/tickets_$origin\_departure_$departure\_stay_$stay\_$DATE\_$RETRY\_$order\.csv"

        RETURN=1
        until [ ${RETURN} -eq 0 ]; do
            echo "$CMD > $RESULT_FILE"
            # eval $CMD
            RETURN=$?
            RETRY=$RETRY+1
            sleep 5
        done
      done
    done
  done
done