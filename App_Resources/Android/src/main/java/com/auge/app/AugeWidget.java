package com.auge.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Home screen widget: the top auges of the moment.
 * The app writes the lines into SharedPreferences "prefs.db" (key "widget") and calls refresh().
 */
public class AugeWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        String text = context.getSharedPreferences("prefs.db", Context.MODE_PRIVATE)
                .getString("widget", "Abre Auge! para ver lo que está en auge.");
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent open = PendingIntent.getActivity(context, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.auge_widget);
            views.setTextViewText(R.id.auge_widget_list, text);
            views.setOnClickPendingIntent(R.id.auge_widget_root, open);
            manager.updateAppWidget(id, views);
        }
    }

    /** Called from the app after it saves fresh widget text. */
    public static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, AugeWidget.class));
        if (ids.length > 0) new AugeWidget().onUpdate(context, manager, ids);
    }
}
