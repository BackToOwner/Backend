import { supabase } from '../../config/supabase.js';
import { db } from '../../db/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { newId } from '../../utils/id.js';

const REPORT_TYPES = ['lost', 'found'];

const REPORT_STATUSES = [
  'open',
  'in_review',
  'matched',
  'returned',
  'closed',
];


/**
 * ==================================================
 * MAP SUPABASE ITEM
 * ==================================================
 *
 * Convert a Supabase lost_items/found_items row
 * into the format expected by the Admin Dashboard.
 */
function mapItem(row, type) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,

    title: row.title,

    type,

    category:
      row.category || 'other',

    location:
      [row.campus, row.area]
        .filter(Boolean)
        .join(' · ') ||
      'Unknown Location',

    coordinates: null,

    distanceKm: 0,

    occurredAt: null,

    reward: null,

    // lost_items has status.
    // found_items currently does not.
    status:
      row.status || 'open',

    matched: false,

    matchedWithId: null,

    matchScore: null,

    reporter: null,

    finder: null,

    description:
      row.details || '',

    images:
      row.image_url
        ? [row.image_url]
        : [],

    verificationDetails: {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at ||
      row.created_at,
  };
}


/**
 * ==================================================
 * SERIALIZE REPORT
 * ==================================================
 *
 * Supports:
 * - Supabase items
 * - Legacy SQLite reports
 *
 * This function is also imported by
 * matches.controller.js.
 */
function serializeReport(row) {
  if (!row) {
    return null;
  }


  // ==================================================
  // SUPABASE ROW
  // ==================================================

  if (
    row.campus !== undefined ||
    row.area !== undefined ||
    row.image_url !== undefined
  ) {
    return mapItem(
      row,
      row.type || 'lost'
    );
  }


  // ==================================================
  // LEGACY SQLITE ROW
  // ==================================================

  return {
    id: row.id,

    title: row.title,

    type: row.type,

    category: row.category,

    status: row.status,

    location: row.location,

    coordinates:
      row.lat != null &&
      row.lng != null
        ? {
            lat: row.lat,
            lng: row.lng,
          }
        : null,

    distanceKm:
      row.distance_km ?? 0,

    occurredAt:
      row.occurred_at ?? null,

    reward:
      row.reward ?? null,

    matched:
      Boolean(row.matched),

    matchedWithId:
      row.matched_with_id ?? null,

    matchScore:
      row.match_score ?? null,

    reporter:
      row.reporter_name
        ? {
            name:
              row.reporter_name,

            contact:
              row.reporter_contact,
          }
        : null,

    finder:
      row.finder_name
        ? {
            name:
              row.finder_name,

            contact:
              row.finder_contact,
          }
        : null,

    description:
      row.description || '',

    images: [],

    verificationDetails: {},

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}


/**
 * ==================================================
 * GET /api/reports
 * ==================================================
 *
 * Reads REAL data from:
 *
 * Supabase
 * ├── lost_items
 * └── found_items
 */
export const listReports =
  asyncHandler(async (req, res) => {
    const {
      search = '',
      type = 'all',
      category = 'all',
      status = 'all',
      page = 1,
      pageSize = 20,
    } = req.query;


    // ==================================================
    // VALIDATE TYPE
    // ==================================================

    if (
      type !== 'all' &&
      !REPORT_TYPES.includes(type)
    ) {
      throw new ApiError(
        400,
        `type must be one of all, ${REPORT_TYPES.join(', ')}`
      );
    }


    // ==================================================
    // VALIDATE STATUS
    // ==================================================

    if (
      status !== 'all' &&
      !REPORT_STATUSES.includes(status)
    ) {
      throw new ApiError(
        400,
        `status must be one of all, ${REPORT_STATUSES.join(', ')}`
      );
    }


    let reports = [];


    // ==================================================
    // LOST ITEMS
    // ==================================================

    if (
      type === 'all' ||
      type === 'lost'
    ) {
      let query =
        supabase
          .from('lost_items')
          .select(`
            id,
            title,
            campus,
            area,
            details,
            category,
            image_url,
            status,
            created_at,
            updated_at
          `)
          .order(
            'created_at',
            {
              ascending: false,
            }
          );


      // ------------------------------
      // CATEGORY FILTER
      // ------------------------------

      if (
        category !== 'all'
      ) {
        query =
          query.eq(
            'category',
            category
          );
      }


      // ------------------------------
      // STATUS FILTER
      // ------------------------------

      if (
        status !== 'all'
      ) {
        query =
          query.eq(
            'status',
            status
          );
      }


      const {
        data,
        error,
      } = await query;


      if (error) {
        console.error(
          'Supabase lost_items error:',
          error
        );

        throw new ApiError(
          500,
          'Failed to load lost items'
        );
      }


      reports.push(
        ...(data || []).map(
          (row) =>
            mapItem(
              row,
              'lost'
            )
        )
      );
    }


    // ==================================================
    // FOUND ITEMS
    // ==================================================

    if (
      type === 'all' ||
      type === 'found'
    ) {
      let query =
        supabase
          .from('found_items')
          .select(`
            id,
            title,
            campus,
            area,
            details,
            category,
            image_url,
            created_at,
            updated_at
          `)
          .order(
            'created_at',
            {
              ascending: false,
            }
          );


      // ------------------------------
      // CATEGORY FILTER
      // ------------------------------

      if (
        category !== 'all'
      ) {
        query =
          query.eq(
            'category',
            category
          );
      }


      /*
       * IMPORTANT:
       *
       * found_items currently does NOT
       * have a status column.
       *
       * Therefore we do NOT apply the
       * status filter to found_items.
       */

      const {
        data,
        error,
      } = await query;


      if (error) {
        console.error(
          'Supabase found_items error:',
          error
        );

        throw new ApiError(
          500,
          'Failed to load found items'
        );
      }


      reports.push(
        ...(data || []).map(
          (row) =>
            mapItem(
              row,
              'found'
            )
        )
      );
    }


    // ==================================================
    // SEARCH
    // ==================================================

    const normalizedSearch =
      String(search)
        .trim()
        .toLowerCase();


    if (
      normalizedSearch
    ) {
      reports =
        reports.filter(
          (item) => {
            return (
              item.title
                ?.toLowerCase()
                .includes(
                  normalizedSearch
                ) ||

              item.location
                ?.toLowerCase()
                .includes(
                  normalizedSearch
                ) ||

              item.id
                ?.toLowerCase()
                .includes(
                  normalizedSearch
                ) ||

              item.description
                ?.toLowerCase()
                .includes(
                  normalizedSearch
                )
            );
          }
        );
    }


    // ==================================================
    // SORT
    // ==================================================

    reports.sort(
      (a, b) => {
        return (
          new Date(
            b.createdAt || 0
          ).getTime() -

          new Date(
            a.createdAt || 0
          ).getTime()
        );
      }
    );


    // ==================================================
    // PAGINATION
    // ==================================================

    const currentPage =
      Math.max(
        Number(page) || 1,
        1
      );


    const limit =
      Math.min(
        Number(pageSize) || 20,
        100
      );


    const total =
      reports.length;


    const totalPages =
      Math.ceil(
        total / limit
      ) || 1;


    const offset =
      (currentPage - 1) *
      limit;


    const paginatedReports =
      reports.slice(
        offset,
        offset + limit
      );


    // ==================================================
    // RESPONSE
    // ==================================================

    res.json({
      success: true,

      data:
        paginatedReports,

      pagination: {
        page:
          currentPage,

        pageSize:
          limit,

        total,

        totalPages,
      },
    });
  });


/**
 * ==================================================
 * GET /api/reports/:id
 * ==================================================
 *
 * Searches both Supabase tables.
 */
export const getReport =
  asyncHandler(async (req, res) => {
    const id =
      req.params.id;


    // ==================================================
    // SEARCH LOST ITEMS
    // ==================================================

    const {
      data: lost,
      error: lostError,
    } =
      await supabase
        .from('lost_items')
        .select(`
          id,
          title,
          campus,
          area,
          details,
          category,
          image_url,
          status,
          created_at,
          updated_at
        `)
        .eq(
          'id',
          id
        )
        .maybeSingle();


    if (lostError) {
      console.error(
        'Supabase lost_items error:',
        lostError
      );

      throw new ApiError(
        500,
        'Failed to load report'
      );
    }


    if (lost) {
      return res.json({
        success: true,

        data:
          mapItem(
            lost,
            'lost'
          ),
      });
    }


    // ==================================================
    // SEARCH FOUND ITEMS
    // ==================================================

    const {
      data: found,
      error: foundError,
    } =
      await supabase
        .from('found_items')
        .select(`
          id,
          title,
          campus,
          area,
          details,
          category,
          image_url,
          created_at,
          updated_at
        `)
        .eq(
          'id',
          id
        )
        .maybeSingle();


    if (foundError) {
      console.error(
        'Supabase found_items error:',
        foundError
      );

      throw new ApiError(
        500,
        'Failed to load report'
      );
    }


    if (!found) {
      throw new ApiError(
        404,
        'Report not found'
      );
    }


    res.json({
      success: true,

      data:
        mapItem(
          found,
          'found'
        ),
    });
  });


/**
 * ==================================================
 * POST /api/reports
 * ==================================================
 *
 * TEMPORARY legacy endpoint.
 *
 * Kept because reports.routes.js imports
 * createReport.
 */
export const createReport =
  asyncHandler(async (req, res) => {
    const b =
      req.body;


    if (!b.title) {
      throw new ApiError(
        400,
        'title is required'
      );
    }


    if (
      !REPORT_TYPES.includes(
        b.type
      )
    ) {
      throw new ApiError(
        400,
        `type must be one of ${REPORT_TYPES.join(', ')}`
      );
    }


    const id =
      b.id ||
      newId('REP');


    db.prepare(`
      INSERT INTO reports (
        id,
        title,
        type,
        category,
        status,
        location,
        description
      )
      VALUES (
        @id,
        @title,
        @type,
        @category,
        @status,
        @location,
        @description
      )
    `).run({
      id,

      title:
        b.title,

      type:
        b.type,

      category:
        b.category ||
        'other',

      status:
        b.status ||
        'open',

      location:
        b.location ||
        'Unknown Location',

      description:
        b.description ||
        '',
    });


    res.status(201).json({
      success: true,

      data: {
        id,

        title:
          b.title,

        type:
          b.type,
      },
    });
  });


/**
 * ==================================================
 * PATCH /api/reports/:id
 * ==================================================
 *
 * IMPORTANT:
 *
 * Real reports come from Supabase.
 *
 * Therefore:
 *
 * If the ID belongs to lost_items:
 *     update Supabase
 *
 * Otherwise:
 *     fall back to legacy SQLite.
 *
 * This is what allows:
 *
 * Verify & Reconcile
 *        ↓
 * lost_items.status = "matched"
 *        ↓
 * Recent Reports → Matched
 */
export const updateReport =
  asyncHandler(async (req, res) => {
    const id =
      req.params.id;

    const b =
      req.body;


    // ==================================================
    // VALIDATE STATUS
    // ==================================================

    if (
      b.status !== undefined &&
      !REPORT_STATUSES.includes(
        b.status
      )
    ) {
      throw new ApiError(
        400,
        `status must be one of ${REPORT_STATUSES.join(', ')}`
      );
    }


    // ==================================================
    // SEARCH SUPABASE LOST ITEMS
    // ==================================================

    const {
      data: lostItem,
      error: lostLookupError,
    } =
      await supabase
        .from('lost_items')
        .select(`
          id,
          title,
          campus,
          area,
          details,
          category,
          image_url,
          status,
          created_at,
          updated_at
        `)
        .eq(
          'id',
          id
        )
        .maybeSingle();


    if (lostLookupError) {
      console.error(
        'Supabase lost_items lookup error:',
        lostLookupError
      );

      throw new ApiError(
        500,
        'Failed to find lost item'
      );
    }


    // ==================================================
    // REAL SUPABASE LOST ITEM
    // ==================================================

    if (lostItem) {
      const updateData =
        {};


      // ------------------------------
      // STATUS
      // ------------------------------

      if (
        b.status !== undefined
      ) {
        updateData.status =
          b.status;
      }


      // ------------------------------
      // OPTIONAL FIELDS
      // ------------------------------

      if (
        b.title !== undefined
      ) {
        updateData.title =
          b.title;
      }

      if (
        b.campus !== undefined
      ) {
        updateData.campus =
          b.campus;
      }

      if (
        b.area !== undefined
      ) {
        updateData.area =
          b.area;
      }

      if (
        b.details !== undefined
      ) {
        updateData.details =
          b.details;
      }

      if (
        b.category !== undefined
      ) {
        updateData.category =
          b.category;
      }


      // ==================================================
      // NOTHING TO UPDATE
      // ==================================================

      if (
        Object.keys(
          updateData
        ).length === 0
      ) {
        return res.json({
          success: true,

          data:
            mapItem(
              lostItem,
              'lost'
            ),
        });
      }


      // ==================================================
      // UPDATE SUPABASE
      // ==================================================

      const {
        data: updatedLostItem,
        error: updateError,
      } =
        await supabase
          .from('lost_items')
          .update(
            updateData
          )
          .eq(
            'id',
            id
          )
          .select(`
            id,
            title,
            campus,
            area,
            details,
            category,
            image_url,
            status,
            created_at,
            updated_at
          `)
          .single();


      if (updateError) {
        console.error(
          'Supabase lost_items update error:',
          updateError
        );

        throw new ApiError(
          500,
          'Failed to update lost item'
        );
      }


      console.log(
        'Supabase lost item updated:',
        updatedLostItem.id,
        updatedLostItem.status
      );


      return res.json({
        success: true,

        data:
          mapItem(
            updatedLostItem,
            'lost'
          ),
      });
    }


    // ==================================================
    // LEGACY SQLITE FALLBACK
    // ==================================================

    const existing =
      db
        .prepare(
          'SELECT * FROM reports WHERE id = ?'
        )
        .get(id);


    if (!existing) {
      throw new ApiError(
        404,
        'Report not found'
      );
    }


    const updateData = {
      id:
        existing.id,

      title:
        b.title ??
        existing.title,

      category:
        b.category ??
        existing.category,

      status:
        b.status ??
        existing.status,

      location:
        b.location ??
        existing.location,

      description:
        b.description ??
        existing.description,
    };


    db.prepare(`
      UPDATE reports
      SET
        title = @title,
        category = @category,
        status = @status,
        location = @location,
        description = @description,
        updated_at = datetime('now')
      WHERE id = @id
    `).run(updateData);


    const row =
      db
        .prepare(
          'SELECT * FROM reports WHERE id = ?'
        )
        .get(existing.id);


    res.json({
      success: true,

      data:
        serializeReport(row),
    });
  });


/**
 * ==================================================
 * DELETE /api/reports/:id
 * ==================================================
 *
 * TEMPORARY legacy endpoint.
 */
export const deleteReport =
  asyncHandler(async (req, res) => {
    const result =
      db
        .prepare(
          'DELETE FROM reports WHERE id = ?'
        )
        .run(
          req.params.id
        );


    if (
      result.changes === 0
    ) {
      throw new ApiError(
        404,
        'Report not found'
      );
    }


    res.json({
      success: true,

      data: {
        id:
          req.params.id,
      },
    });
  });


/**
 * ==================================================
 * EXPORTS
 * ==================================================
 */

export {
  mapItem,
  serializeReport,
  REPORT_STATUSES,
  REPORT_TYPES,
};